/**
 * Enhanced Firebase Hook for Invoice Editing  
 * Provides real-time data with advanced conflict resolution and performance optimization
 */

import { useState, useEffect, useCallback } from 'react'
import { 
  collection, 
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc
} from 'firebase/firestore'
import { db } from '../firebaseConfig'
import AtomicOperations from '../utils/AtomicOperations'
import ConflictResolver from '../utils/ConflictResolver'
import AuditTrail from '../utils/AuditTrail'
import PerformanceOptimizer from '../utils/PerformanceOptimizer'
import StockReconciliation from '../utils/StockReconciliation'

export const useInvoiceEditor = (invoiceId, invoiceProp = null) => {
  const [invoice, setInvoice] = useState(invoiceProp)
  const [loading, setLoading] = useState(!invoiceProp)
  const [error, setError] = useState(null)
  const [editSession, setEditSession] = useState(null)

  // Set invoice from prop if provided
  useEffect(() => {
    if (invoiceProp) {
      console.log('🔧 useInvoiceEditor - setting invoice from prop:', invoiceProp.id)
      setInvoice(invoiceProp)
      setLoading(false)
    }
  }, [invoiceProp])

  // Load invoice data from Firebase (as fallback or for updates)
  useEffect(() => {
    if (!invoiceId) {
      setLoading(false)
      return
    }

    // If we already have invoice from prop, skip Firebase loading
    if (invoiceProp) {
      return
    }

    console.log('🔧 useInvoiceEditor - loading invoice from Firebase:', invoiceId)
    const unsubscribe = onSnapshot(
      doc(db, 'invoices', invoiceId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const invoiceData = { id: docSnapshot.id, ...docSnapshot.data() }
          setInvoice(invoiceData)
          setError(null)
        } else {
          setError(new Error('Invoice not found'))
          setInvoice(null)
        }
        setLoading(false)
      },
      (err) => {
        console.error('Error loading invoice:', err)
        setError(err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [invoiceId, invoiceProp])

  // Start edit session with advanced conflict detection
  const startEdit = useCallback(async () => {
    console.log('🔧 startEdit called - invoice:', invoice?.id, 'invoiceId:', invoiceId)
    if (!invoice) {
      console.warn('⚠️ Cannot start edit - invoice not loaded yet')
      return null
    }

    // Record edit start in audit trail
    await AuditTrail.recordEditStart(invoiceId, invoice)
    
    // Store edit start time for performance tracking
    window.sessionStorage.setItem('edit_start_time', Date.now().toString())

    const session = {
      id: `edit_${invoiceId}_${Date.now()}`,
      originalInvoice: { ...invoice },
      currentInvoice: { ...invoice },
      isDirty: false,
      isValid: true,
      validationErrors: [],
      validationWarnings: [],
      conflicts: null,
      startTime: new Date(),
      performanceMetrics: {
        editStartTime: performance.now(),
        validationCalls: 0,
        conflictChecks: 0
      }
    }

    setEditSession(session)
    return session
  }, [invoice, invoiceId])

  // Update edit session
  const updateEdit = useCallback((updates, parts = []) => {
    if (!editSession) return null

    const updatedInvoice = { ...editSession.currentInvoice, ...updates }
    
    // Validate changes
    const analysis = StockReconciliation.analyzeInvoiceEdit(
      editSession.originalInvoice,
      updatedInvoice,
      parts
    )

    const newSession = {
      ...editSession,
      currentInvoice: updatedInvoice,
      isDirty: true,
      isValid: analysis.validation.isValid,
      validationErrors: analysis.validation.errors,
      validationWarnings: analysis.validation.warnings,
      analysis: analysis,
      lastModified: new Date()
    }

    setEditSession(newSession)
    return newSession
  }, [editSession])

  // Save changes with advanced conflict resolution
  const saveEdit = useCallback(async (parts = []) => {
    if (!editSession || !editSession.isValid) {
      throw new Error('Cannot save invalid edit session')
    }

    return PerformanceOptimizer.monitorPerformance('save_invoice_edit', async () => {
      try {
        setLoading(true)
        
        // Step 1: Pre-flight conflict check
        const conflictCheck = await ConflictResolver.checkForConflictsBeforeSave(
          invoiceId,
          editSession.originalInvoice.version || 1
        )

        if (conflictCheck.hasConflicts) {
          // Update edit session with conflict information
          setEditSession(prev => ({
            ...prev,
            conflicts: conflictCheck.conflicts,
            conflictAnalysis: ConflictResolver.detectConflicts(
              editSession.originalInvoice,
              conflictCheck.remoteInvoice
            )
          }))

          // Return conflict result for UI handling
          return {
            success: false,
            hasConflicts: true,
            conflicts: conflictCheck.conflicts,
            conflictAnalysis: ConflictResolver.detectConflicts(
              editSession.originalInvoice,
              conflictCheck.remoteInvoice
            ),
            resolutionRequired: true
          }
        }

        // Step 2: Execute atomic operation
        const result = await AtomicOperations.executeInvoiceEdit(
          invoiceId,
          editSession.currentInvoice,
          parts,
          editSession.originalInvoice
        )

        if (result.success) {
          // Clear edit session and performance tracking
          setEditSession(null)
          window.sessionStorage.removeItem('edit_start_time')
          
          // Clear relevant cache entries
          PerformanceOptimizer.clearCache()
          
          return result
        } else {
          throw new Error(result.error)
        }
      } catch (error) {
        console.error('Save failed:', error)
        throw error
      } finally {
        setLoading(false)
      }
    })
  }, [editSession, invoiceId])

  // Handle conflict resolution
  const resolveConflicts = useCallback(async (strategy, resolvedInvoice, parts = []) => {
    if (!editSession || !editSession.conflicts) {
      throw new Error('No conflicts to resolve')
    }

    try {
      setLoading(true)

      // Update edit session with resolved invoice
      const updatedSession = {
        ...editSession,
        currentInvoice: resolvedInvoice,
        conflicts: null,
        conflictAnalysis: null,
        isDirty: true,
        performanceMetrics: {
          ...editSession.performanceMetrics,
          conflictChecks: editSession.performanceMetrics.conflictChecks + 1
        }
      }

      setEditSession(updatedSession)

      // Record conflict resolution in audit trail
      await AuditTrail.recordEntry({
        action: 'conflict_resolved',
        category: 'invoice_editing',
        invoiceId,
        details: {
          strategy: strategy.id,
          strategyName: strategy.name,
          resolutionRisk: strategy.risk,
          originalConflicts: editSession.conflictAnalysis?.conflicts?.length || 0
        },
        metadata: {
          source: 'conflict_resolution_modal',
          sessionId: editSession.id
        }
      })

      // If strategy is immediate save, execute it
      if (strategy.action === 'force_save' || strategy.action === 'auto_merge') {
        return await AtomicOperations.executeInvoiceEdit(
          invoiceId,
          resolvedInvoice,
          parts,
          editSession.originalInvoice
        )
      }

      // Otherwise, return updated session for further editing
      return {
        success: true,
        conflictResolved: true,
        editSession: updatedSession
      }

    } catch (error) {
      console.error('Conflict resolution failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [editSession, invoiceId])

  // Cancel edit with cleanup
  const cancelEdit = useCallback(() => {
    setEditSession(null)
  }, [])

  // Delete invoice
  const deleteInvoice = useCallback(async (parts = []) => {
    if (!invoice) {
      throw new Error('No invoice to delete')
    }

    try {
      setLoading(true)
      
      const result = await AtomicOperations.deleteInvoiceWithStockRestoration(
        invoiceId,
        invoice,
        parts
      )

      if (!result.success) {
        throw new Error(result.error)
      }

      return result
    } catch (error) {
      console.error('Delete failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [invoice, invoiceId])

  return {
    // Data
    invoice,
    loading,
    error,
    
    // Edit session
    editSession,
    isEditing: !!editSession,
    isDirty: editSession?.isDirty || false,
    isValid: editSession?.isValid ?? true,
    validationErrors: editSession?.validationErrors || [],
    validationWarnings: editSession?.validationWarnings || [],
    
    // Conflict resolution
    hasConflicts: editSession?.conflicts !== null,
    conflicts: editSession?.conflicts || null,
    conflictAnalysis: editSession?.conflictAnalysis || null,
    
    // Actions
    startEdit,
    updateEdit,
    saveEdit,
    cancelEdit,
    deleteInvoice,
    resolveConflicts,
    
    // Analysis
    stockAnalysis: editSession?.analysis,
    performanceMetrics: editSession?.performanceMetrics || null
  }
}

// Hook for real-time parts data during editing
export const usePartsForEditing = () => {
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'parts'), orderBy('namaProduk', 'asc'))
    
    const unsubscribe = onSnapshot(q,
      (querySnapshot) => {
        const partsData = []
        querySnapshot.forEach((doc) => {
          partsData.push({ id: doc.id, ...doc.data() })
        })
        setParts(partsData)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('Error loading parts:', err)
        setError(err)
        setLoading(false)
        
        // Fallback to localStorage
        try {
          const localParts = localStorage.getItem('parts')
          if (localParts) {
            setParts(JSON.parse(localParts))
          }
        } catch (localError) {
          console.error('Error loading from localStorage:', localError)
        }
      }
    )

    return () => unsubscribe()
  }, [])

  return { parts, loading, error }
}

// Hook for concurrent edit detection
export const useConcurrentEditDetection = (invoiceId) => {
  const [conflicts, setConflicts] = useState([])
  const [lastKnownVersion, setLastKnownVersion] = useState(null)

  const checkForConflicts = useCallback(async () => {
    if (!invoiceId || !lastKnownVersion) return

    try {
      const docSnapshot = await getDoc(doc(db, 'invoices', invoiceId))
      if (docSnapshot.exists()) {
        const currentVersion = docSnapshot.data().version || 1
        if (currentVersion > lastKnownVersion) {
          setConflicts([{
            type: 'version_conflict',
            message: 'This invoice has been modified by another user',
            currentVersion,
            expectedVersion: lastKnownVersion,
            timestamp: new Date()
          }])
        } else {
          setConflicts([])
        }
      }
    } catch (error) {
      console.error('Error checking for conflicts:', error)
      setConflicts([{
        type: 'check_error',
        message: 'Unable to check for conflicts',
        error: error.message,
        timestamp: new Date()
      }])
    }
  }, [invoiceId, lastKnownVersion])

  // Set initial version
  const setInitialVersion = useCallback((version) => {
    setLastKnownVersion(version)
  }, [])

  // Check conflicts periodically
  useEffect(() => {
    if (!invoiceId || !lastKnownVersion) return

    const interval = setInterval(checkForConflicts, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [invoiceId, lastKnownVersion, checkForConflicts])

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
    setInitialVersion,
    checkForConflicts
  }
}
