import { createContext, useContext, useState, useEffect } from 'react'
import { useFirebaseCollection } from '../hooks/useFirebaseData'
import AtomicOperations from '../utils/AtomicOperations'
import StockReconciliation from '../utils/StockReconciliation'
import InvoiceEditValidator from '../utils/InvoiceEditValidator'
import { 
  createInvoiceEditSession, 
  InvoiceEditSessionState,
  createContextualError 
} from '../types/InvoiceTypes'

const InvoiceContext = createContext()

export const useInvoiceContext = () => {
  const context = useContext(InvoiceContext)
  if (!context) {
    throw new Error('useInvoiceContext must be used within an InvoiceProvider')
  }
  return context
}

export function InvoiceProvider({ children }) {
  const { 
    data: invoices, 
    loading, 
    error, 
    addItem: addInvoice,
    updateItem: updateInvoice,
    deleteItem: deleteInvoiceFromFirebase
  } = useFirebaseCollection('invoices')

  // State for invoice editing
  const [editingSessions, setEditingSessions] = useState(new Map())
  const [activeEditSession, setActiveEditSession] = useState(null)

  const [invoiceCounter, setInvoiceCounter] = useState(() => {
    const saved = localStorage.getItem('invoice-counter')
    return saved ? parseInt(saved) : 1
  })

  // Update counter based on existing invoices
  useEffect(() => {
    if (invoices.length > 0) {
      const maxCounter = Math.max(
        ...invoices.map(invoice => {
          const match = invoice.invoiceNumber?.match(/INV-\d{4}-(\d{4})/)
          return match ? parseInt(match[1]) : 0
        })
      )
      if (maxCounter >= invoiceCounter) {
        setInvoiceCounter(maxCounter + 1)
      }
    }
  }, [invoices, invoiceCounter])

  // Save counter to localStorage
  useEffect(() => {
    localStorage.setItem('invoice-counter', invoiceCounter.toString())
  }, [invoiceCounter])

  const generateInvoiceNumber = () => {
    const currentYear = new Date().getFullYear()
    const paddedCounter = invoiceCounter.toString().padStart(4, '0')
    return `INV-${currentYear}-${paddedCounter}`
  }

  const createInvoice = async (invoiceData) => {
    const newInvoice = {
      invoiceNumber: generateInvoiceNumber(),
      dateCreated: new Date().toISOString(),
      items: invoiceData.items.map(item => ({
        partId: item.partId,
        kodProduk: item.kodProduk,
        namaProduk: item.namaProduk,
        originalPrice: item.originalPrice,
        quantity: item.quantity,
        markupType: item.markupType, // 'percentage' or 'fixed'
        markupValue: item.markupValue,
        finalPrice: item.finalPrice,
        totalPrice: item.totalPrice
      })),
      subtotal: invoiceData.subtotal,
      totalAmount: invoiceData.totalAmount,
      customerInfo: invoiceData.customerInfo || {},
      notes: invoiceData.notes || ''
    }

    const id = await addInvoice(newInvoice)
    setInvoiceCounter(prev => prev + 1)
    
    return { id, ...newInvoice }
  }

  /**
   * Start editing an invoice
   * @param {String} invoiceId - Invoice to edit
   * @returns {Object} Edit session
   */
  const startInvoiceEdit = (invoiceId) => {
    const invoice = invoices.find(inv => inv.id === invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }

    const editSession = createInvoiceEditSession(invoice)
    setEditingSessions(prev => new Map(prev).set(invoiceId, editSession))
    setActiveEditSession(editSession)
    
    return editSession
  }

  /**
   * Update current invoice edit
   * @param {String} sessionId - Edit session ID
   * @param {Object} updates - Invoice updates
   * @param {Array} parts - Current parts for validation
   * @returns {Object} Updated session
   */
  const updateInvoiceEdit = (sessionId, updates, parts = []) => {
    const session = Array.from(editingSessions.values()).find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Edit session ${sessionId} not found`)
    }

    const updatedInvoice = { ...session.currentInvoice, ...updates }
    const validation = InvoiceEditValidator.validateRealTime(
      { ...session, currentInvoice: updatedInvoice }, 
      parts
    )

    const updatedSession = {
      ...session,
      currentInvoice: updatedInvoice,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      isValid: validation.isValid,
      isDirty: true,
      lastModified: new Date(),
      state: validation.isValid ? InvoiceEditSessionState.EDITING : InvoiceEditSessionState.ERROR
    }

    setEditingSessions(prev => new Map(prev).set(session.originalInvoice.id, updatedSession))
    if (activeEditSession?.id === sessionId) {
      setActiveEditSession(updatedSession)
    }

    return updatedSession
  }

  /**
   * Validate current invoice edit
   * @param {String} sessionId - Edit session ID
   * @param {Array} parts - Current parts for validation
   * @returns {Object} Validation result
   */
  const validateInvoiceEdit = (sessionId, parts = []) => {
    const session = Array.from(editingSessions.values()).find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Edit session ${sessionId} not found`)
    }

    const validation = InvoiceEditValidator.validateRealTime(session, parts)
    
    const updatedSession = {
      ...session,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      isValid: validation.isValid,
      state: validation.isValid ? InvoiceEditSessionState.EDITING : InvoiceEditSessionState.ERROR
    }

    setEditingSessions(prev => new Map(prev).set(session.originalInvoice.id, updatedSession))
    if (activeEditSession?.id === sessionId) {
      setActiveEditSession(updatedSession)
    }

    return validation
  }

  /**
   * Save invoice edit atomically
   * @param {String} sessionId - Edit session ID
   * @param {Array} parts - Current parts for stock updates
   * @returns {Promise<Object>} Save result
   */
  const saveInvoiceEdit = async (sessionId, parts = []) => {
    const session = Array.from(editingSessions.values()).find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Edit session ${sessionId} not found`)
    }

    // Update session state to saving
    const savingSession = {
      ...session,
      state: InvoiceEditSessionState.SAVING
    }
    setEditingSessions(prev => new Map(prev).set(session.originalInvoice.id, savingSession))
    if (activeEditSession?.id === sessionId) {
      setActiveEditSession(savingSession)
    }

    try {
      // Execute atomic update
      const result = await AtomicOperations.executeInvoiceEdit(
        session.originalInvoice.id,
        session.currentInvoice,
        parts,
        session.originalInvoice
      )

      if (result.success) {
        // Remove edit session on successful save
        setEditingSessions(prev => {
          const newMap = new Map(prev)
          newMap.delete(session.originalInvoice.id)
          return newMap
        })
        
        if (activeEditSession?.id === sessionId) {
          setActiveEditSession(null)
        }

        return {
          success: true,
          invoice: result.updatedInvoice,
          message: result.message,
          details: result.details
        }
      } else {
        // Update session with error
        const errorSession = {
          ...session,
          state: InvoiceEditSessionState.ERROR,
          validationErrors: [
            createContextualError('SAVE_ERROR', result.error, result.details)
          ]
        }
        setEditingSessions(prev => new Map(prev).set(session.originalInvoice.id, errorSession))
        if (activeEditSession?.id === sessionId) {
          setActiveEditSession(errorSession)
        }

        return result
      }
    } catch (error) {
      console.error('Save invoice edit failed:', error)
      
      const errorSession = {
        ...session,
        state: InvoiceEditSessionState.ERROR,
        validationErrors: [
          createContextualError('SAVE_ERROR', error.message, { error })
        ]
      }
      setEditingSessions(prev => new Map(prev).set(session.originalInvoice.id, errorSession))
      if (activeEditSession?.id === sessionId) {
        setActiveEditSession(errorSession)
      }

      return {
        success: false,
        error: error.message,
        details: error
      }
    }
  }

  /**
   * Cancel invoice edit
   * @param {String} sessionId - Edit session ID
   */
  const cancelInvoiceEdit = (sessionId) => {
    const session = Array.from(editingSessions.values()).find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Edit session ${sessionId} not found`)
    }

    setEditingSessions(prev => {
      const newMap = new Map(prev)
      newMap.delete(session.originalInvoice.id)
      return newMap
    })

    if (activeEditSession?.id === sessionId) {
      setActiveEditSession(null)
    }
  }

  /**
   * Delete invoice with stock restoration
   * @param {String} invoiceId - Invoice to delete
   * @param {Array} parts - Current parts for stock restoration
   * @returns {Promise<Object>} Delete result
   */
  const deleteInvoice = async (invoiceId, parts = []) => {
    const invoice = invoices.find(inv => inv.id === invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }

    try {
      const result = await AtomicOperations.deleteInvoiceWithStockRestoration(
        invoiceId,
        invoice,
        parts
      )

      if (result.success) {
        // Also remove any active edit session for this invoice
        setEditingSessions(prev => {
          const newMap = new Map(prev)
          newMap.delete(invoiceId)
          return newMap
        })

        if (activeEditSession?.originalInvoice?.id === invoiceId) {
          setActiveEditSession(null)
        }
      }

      return result
    } catch (error) {
      console.error('Delete invoice failed:', error)
      return {
        success: false,
        error: error.message,
        details: error
      }
    }
  }

  const getInvoiceById = (id) => {
    return invoices.find(invoice => invoice.id === id)
  }

  const searchInvoices = (query) => {
    if (!query) return invoices
    const lowercaseQuery = query.toLowerCase()
    return invoices.filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(lowercaseQuery) ||
      (invoice.customerInfo?.name && invoice.customerInfo.name.toLowerCase().includes(lowercaseQuery)) ||
      invoice.items.some(item => 
        item.kodProduk.toLowerCase().includes(lowercaseQuery) ||
        item.namaProduk.toLowerCase().includes(lowercaseQuery)
      )
    )
  }

  const getInvoicesByDateRange = (startDate, endDate) => {
    return invoices.filter(invoice => {
      const invoiceDate = new Date(invoice.dateCreated)
      return invoiceDate >= new Date(startDate) && invoiceDate <= new Date(endDate)
    })
  }

  const calculateInvoiceStats = () => {
    const totalInvoices = invoices.length
    const totalRevenue = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
    const averageInvoiceValue = totalInvoices > 0 ? totalRevenue / totalInvoices : 0
    
    return {
      totalInvoices,
      totalRevenue,
      averageInvoiceValue
    }
  }

  return (
    <InvoiceContext.Provider value={{
      invoices,
      loading,
      error,
      createInvoice,
      getInvoiceById,
      searchInvoices,
      getInvoicesByDateRange,
      calculateInvoiceStats,
      generateInvoiceNumber: () => `INV-${new Date().getFullYear()}-${invoiceCounter.toString().padStart(4, '0')}`,
      // New invoice editing methods
      startInvoiceEdit,
      updateInvoiceEdit,
      validateInvoiceEdit,
      saveInvoiceEdit,
      cancelInvoiceEdit,
      deleteInvoice,
      // Edit session state
      editingSessions,
      activeEditSession,
      // Helper methods
      isInvoiceBeingEdited: (invoiceId) => editingSessions.has(invoiceId),
      getEditSession: (invoiceId) => editingSessions.get(invoiceId)
    }}>
      {children}
    </InvoiceContext.Provider>
  )
}
