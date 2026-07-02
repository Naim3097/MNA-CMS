import { createContext, useContext, useReducer, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebaseConfig'

// Transaction Context
const TransactionContext = createContext()

// Initial state
const initialState = {
  transactions: [],
  customerInvoices: [],
  pendingInvoices: [],
  paidInvoices: [],
  accountingSummary: {
    totalRevenue: 0,
    totalPendingAmount: 0,
    totalCommissions: 0,
    totalProfit: 0,
    invoiceCount: 0,
    paidInvoiceCount: 0,
    pendingInvoiceCount: 0
  },
  isLoadingTransactions: false,
  isLoadingInvoices: false,
  transactionError: null
}

// Action types
const TRANSACTION_ACTIONS = {
  SET_LOADING_TRANSACTIONS: 'SET_LOADING_TRANSACTIONS',
  SET_LOADING_INVOICES: 'SET_LOADING_INVOICES',
  SET_TRANSACTIONS: 'SET_TRANSACTIONS',
  SET_CUSTOMER_INVOICES: 'SET_CUSTOMER_INVOICES',
  SET_PENDING_INVOICES: 'SET_PENDING_INVOICES',
  SET_PAID_INVOICES: 'SET_PAID_INVOICES',
  SET_ACCOUNTING_SUMMARY: 'SET_ACCOUNTING_SUMMARY',
  ADD_TRANSACTION: 'ADD_TRANSACTION',
  UPDATE_INVOICE_STATUS: 'UPDATE_INVOICE_STATUS',
  SET_ERROR: 'SET_ERROR'
}

// Reducer
function transactionReducer(state, action) {
  switch (action.type) {
    case TRANSACTION_ACTIONS.SET_LOADING_TRANSACTIONS:
      return { ...state, isLoadingTransactions: action.payload }
    
    case TRANSACTION_ACTIONS.SET_LOADING_INVOICES:
      return { ...state, isLoadingInvoices: action.payload }
    
    case TRANSACTION_ACTIONS.SET_TRANSACTIONS:
      return { ...state, transactions: action.payload, isLoadingTransactions: false }
    
    case TRANSACTION_ACTIONS.SET_CUSTOMER_INVOICES:
      return { ...state, customerInvoices: action.payload, isLoadingInvoices: false }
    
    case TRANSACTION_ACTIONS.SET_PENDING_INVOICES:
      return { ...state, pendingInvoices: action.payload }
    
    case TRANSACTION_ACTIONS.SET_PAID_INVOICES:
      return { ...state, paidInvoices: action.payload }
    
    case TRANSACTION_ACTIONS.SET_ACCOUNTING_SUMMARY:
      return { ...state, accountingSummary: action.payload }
    
    case TRANSACTION_ACTIONS.ADD_TRANSACTION:
      return { 
        ...state, 
        transactions: [action.payload, ...state.transactions]
      }
    
    case TRANSACTION_ACTIONS.UPDATE_INVOICE_STATUS:
      return {
        ...state,
        customerInvoices: state.customerInvoices.map(invoice =>
          invoice.id === action.payload.invoiceId
            ? { ...invoice, paymentStatus: action.payload.status, paymentDate: action.payload.paymentDate }
            : invoice
        )
      }
    
    case TRANSACTION_ACTIONS.SET_ERROR:
      return { 
        ...state, 
        transactionError: action.payload,
        isLoadingTransactions: false,
        isLoadingInvoices: false 
      }
    
    default:
      return state
  }
}

// Provider component
export function TransactionProvider({ children }) {
  const [state, dispatch] = useReducer(transactionReducer, initialState)

  // Load all transactions from our 'transactions' collection
  const loadTransactions = async () => {
    try {
      dispatch({ type: TRANSACTION_ACTIONS.SET_LOADING_TRANSACTIONS, payload: true })
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: null })

      const transactionsRef = collection(db, 'transactions')
      const transactionsQuery = query(transactionsRef, orderBy('paymentDate', 'desc'))
      const transactionsSnapshot = await getDocs(transactionsQuery)
      
      const transactionsData = transactionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      dispatch({ type: TRANSACTION_ACTIONS.SET_TRANSACTIONS, payload: transactionsData })
    } catch (error) {
      console.error('Error loading transactions:', error)
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: error.message })
    }
  }

  // Load all customer invoices from our 'customer_invoices' collection
  const loadCustomerInvoices = async () => {
    try {
      dispatch({ type: TRANSACTION_ACTIONS.SET_LOADING_INVOICES, payload: true })
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: null })

      const invoicesRef = collection(db, 'customer_invoices')
      const invoicesQuery = query(invoicesRef, orderBy('dateCreated', 'desc'))
      const invoicesSnapshot = await getDocs(invoicesQuery)
      
      const invoicesData = invoicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      dispatch({ type: TRANSACTION_ACTIONS.SET_CUSTOMER_INVOICES, payload: invoicesData })

      // Separate pending and paid invoices
      const pending = invoicesData.filter(invoice => invoice.paymentStatus === 'pending')
      const paid = invoicesData.filter(invoice => invoice.paymentStatus === 'paid')

      dispatch({ type: TRANSACTION_ACTIONS.SET_PENDING_INVOICES, payload: pending })
      dispatch({ type: TRANSACTION_ACTIONS.SET_PAID_INVOICES, payload: paid })
    } catch (error) {
      console.error('Error loading customer invoices:', error)
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: error.message })
    }
  }

  // Record a new payment
  const recordPayment = async (paymentData) => {
    try {
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: null })

      // Add transaction to 'transactions' collection
      const transactionData = {
        invoiceId: paymentData.invoiceId,
        customerId: paymentData.customerId,
        transactionNumber: `TXN-${Date.now()}`,
        amount: paymentData.amount,
        paymentDate: new Date(),
        paymentMethod: paymentData.paymentMethod,
        referenceNumber: paymentData.referenceNumber || '',
        status: 'completed',
        processedBy: 'Workshop Staff',
        notes: paymentData.notes || '',
        dateCreated: new Date()
      }

      const transactionRef = await addDoc(collection(db, 'transactions'), transactionData)
      
      // Update invoice payment status
      const invoiceRef = doc(db, 'customer_invoices', paymentData.invoiceId)
      await updateDoc(invoiceRef, {
        paymentStatus: 'paid',
        paymentDate: new Date(),
        paymentMethod: paymentData.paymentMethod
      })

      // Add to local state
      dispatch({ 
        type: TRANSACTION_ACTIONS.ADD_TRANSACTION, 
        payload: { id: transactionRef.id, ...transactionData }
      })

      // Update invoice status in local state
      dispatch({
        type: TRANSACTION_ACTIONS.UPDATE_INVOICE_STATUS,
        payload: {
          invoiceId: paymentData.invoiceId,
          status: 'paid',
          paymentDate: new Date()
        }
      })

      return transactionRef.id
    } catch (error) {
      console.error('Error recording payment:', error)
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: error.message })
      throw error
    }
  }

  // Update payment status
  const updatePaymentStatus = async (invoiceId, status) => {
    try {
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: null })

      const invoiceRef = doc(db, 'customer_invoices', invoiceId)
      const updateData = { paymentStatus: status }
      
      if (status === 'paid') {
        updateData.paymentDate = new Date()
      }

      await updateDoc(invoiceRef, updateData)

      // Update local state
      dispatch({
        type: TRANSACTION_ACTIONS.UPDATE_INVOICE_STATUS,
        payload: {
          invoiceId,
          status,
          paymentDate: status === 'paid' ? new Date() : null
        }
      })
    } catch (error) {
      console.error('Error updating payment status:', error)
      dispatch({ type: TRANSACTION_ACTIONS.SET_ERROR, payload: error.message })
      throw error
    }
  }

  // Generate accounting summary
  const generateAccountingSummary = () => {
    const summary = {
      totalRevenue: 0,
      totalPendingAmount: 0,
      totalCommissions: 0,
      totalProfit: 0,
      invoiceCount: state.customerInvoices.length,
      paidInvoiceCount: state.paidInvoices.length,
      pendingInvoiceCount: state.pendingInvoices.length,
      averageInvoiceValue: 0
    }

    // Calculate totals from paid invoices
    state.paidInvoices.forEach(invoice => {
      summary.totalRevenue += invoice.customerTotal || 0
    })

    // Calculate total pending amount
    state.pendingInvoices.forEach(invoice => {
      summary.totalPendingAmount += invoice.customerTotal || 0
    })

    // Calculate average invoice value
    if (summary.paidInvoiceCount > 0) {
      summary.averageInvoiceValue = summary.totalRevenue / summary.paidInvoiceCount
    }

    dispatch({ type: TRANSACTION_ACTIONS.SET_ACCOUNTING_SUMMARY, payload: summary })
  }

  // Load data on mount
  useEffect(() => {
    loadTransactions()
    loadCustomerInvoices()
  }, [])

  // Update accounting summary when invoices change
  useEffect(() => {
    generateAccountingSummary()
  }, [state.customerInvoices, state.paidInvoices, state.pendingInvoices])

  const value = {
    // State
    ...state,
    
    // Actions
    loadTransactions,
    loadCustomerInvoices,
    recordPayment,
    updatePaymentStatus,
    generateAccountingSummary
  }

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  )
}

// Custom hook to use transaction context
export function useTransaction() {
  const context = useContext(TransactionContext)
  if (!context) {
    throw new Error('useTransaction must be used within a TransactionProvider')
  }
  return context
}

export default TransactionContext