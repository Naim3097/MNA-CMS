/**
 * Audit Trail System
 * Tracks all invoice modifications for compliance and debugging
 */

import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '../firebaseConfig'

export class AuditTrail {
  
  /**
   * Record an audit entry for invoice operations
   * @param {Object} auditEntry - Audit entry data
   * @returns {Promise<String>} Audit entry ID
   */
  static async recordEntry(auditEntry) {
    try {
      const entry = {
        ...auditEntry,
        timestamp: new Date(),
        sessionId: this.getSessionId(),
        userAgent: navigator.userAgent,
        ipAddress: await this.getClientIP() // For compliance tracking
      }

      const docRef = await addDoc(collection(db, 'audit_trail'), entry)
      
      console.log('Audit entry recorded:', entry.action, entry.invoiceId)
      return docRef.id

    } catch (error) {
      console.error('Failed to record audit entry:', error)
      // Don't throw - audit failures shouldn't break main operations
      return null
    }
  }

  /**
   * Record invoice creation audit
   * @param {String} invoiceId - Invoice ID
   * @param {Object} invoiceData - Invoice data
   * @param {Object} stockChanges - Stock changes applied
   * @returns {Promise<String>} Audit entry ID
   */
  static async recordInvoiceCreation(invoiceId, invoiceData, stockChanges) {
    return this.recordEntry({
      action: 'invoice_created',
      category: 'invoice_lifecycle',
      invoiceId,
      invoiceNumber: invoiceData.invoiceNumber,
      details: {
        customerName: invoiceData.customerInfo?.name,
        itemCount: invoiceData.items?.length || 0,
        totalAmount: invoiceData.totalAmount,
        currency: 'MYR',
        itemDetails: invoiceData.items?.map(item => ({
          partId: item.partId,
          partName: item.namaProduk,
          quantity: item.quantity,
          unitPrice: item.finalPrice,
          totalPrice: item.totalPrice
        }))
      },
      stockChanges,
      metadata: {
        source: 'invoice_generation',
        version: 1
      }
    })
  }

  /**
   * Record invoice edit start
   * @param {String} invoiceId - Invoice ID
   * @param {Object} originalInvoice - Original invoice data
   * @returns {Promise<String>} Audit entry ID
   */
  static async recordEditStart(invoiceId, originalInvoice) {
    return this.recordEntry({
      action: 'invoice_edit_started',
      category: 'invoice_editing',
      invoiceId,
      invoiceNumber: originalInvoice.invoiceNumber,
      details: {
        originalVersion: originalInvoice.version || 1,
        editSessionId: this.generateEditSessionId(),
        originalData: {
          customerInfo: originalInvoice.customerInfo,
          items: originalInvoice.items?.map(item => ({
            partId: item.partId,
            partName: item.namaProduk,
            quantity: item.quantity,
            unitPrice: item.finalPrice
          })),
          totalAmount: originalInvoice.totalAmount,
          notes: originalInvoice.notes
        }
      },
      metadata: {
        source: 'edit_modal',
        editReason: 'user_initiated'
      }
    })
  }

  /**
   * Record invoice edit completion
   * @param {String} invoiceId - Invoice ID
   * @param {Object} originalInvoice - Original invoice data
   * @param {Object} updatedInvoice - Updated invoice data
   * @param {Object} stockChanges - Stock changes applied
   * @returns {Promise<String>} Audit entry ID
   */
  static async recordEditCompletion(invoiceId, originalInvoice, updatedInvoice, stockChanges) {
    const changes = this.calculateChanges(originalInvoice, updatedInvoice)
    
    return this.recordEntry({
      action: 'invoice_edit_completed',
      category: 'invoice_editing',
      invoiceId,
      invoiceNumber: updatedInvoice.invoiceNumber,
      details: {
        originalVersion: originalInvoice.version || 1,
        newVersion: updatedInvoice.version,
        changesApplied: changes,
        customerChanges: this.compareCustomerInfo(originalInvoice.customerInfo, updatedInvoice.customerInfo),
        itemChanges: this.compareItems(originalInvoice.items, updatedInvoice.items),
        totalAmountChange: {
          from: originalInvoice.totalAmount,
          to: updatedInvoice.totalAmount,
          difference: updatedInvoice.totalAmount - originalInvoice.totalAmount
        }
      },
      stockChanges,
      metadata: {
        source: 'edit_modal',
        editDuration: this.getEditDuration(),
        changeCount: changes.totalChanges
      }
    })
  }

  /**
   * Record invoice deletion
   * @param {String} invoiceId - Invoice ID
   * @param {Object} invoiceData - Deleted invoice data
   * @param {Object} stockChanges - Stock restoration applied
   * @returns {Promise<String>} Audit entry ID
   */
  static async recordInvoiceDeletion(invoiceId, invoiceData, stockChanges) {
    return this.recordEntry({
      action: 'invoice_deleted',
      category: 'invoice_lifecycle',
      invoiceId,
      invoiceNumber: invoiceData.invoiceNumber,
      details: {
        deletedData: {
          customerName: invoiceData.customerInfo?.name,
          itemCount: invoiceData.items?.length || 0,
          totalAmount: invoiceData.totalAmount,
          createdDate: invoiceData.createdAt,
          lastModified: invoiceData.updatedAt,
          version: invoiceData.version
        },
        itemsRestored: invoiceData.items?.map(item => ({
          partId: item.partId,
          partName: item.namaProduk,
          quantityRestored: item.quantity
        }))
      },
      stockChanges,
      metadata: {
        source: 'invoice_history',
        reason: 'user_initiated_deletion'
      }
    })
  }

  /**
   * Record stock operation
   * @param {String} operation - Operation type
   * @param {Array} stockChanges - Stock changes
   * @param {String} relatedInvoiceId - Related invoice ID
   * @returns {Promise<String>} Audit entry ID
   */
  static async recordStockOperation(operation, stockChanges, relatedInvoiceId = null) {
    return this.recordEntry({
      action: `stock_${operation}`,
      category: 'stock_management',
      invoiceId: relatedInvoiceId,
      details: {
        operation,
        stockChanges: stockChanges.map(change => ({
          partId: change.partId,
          partName: change.partName,
          quantityBefore: change.quantityBefore,
          quantityAfter: change.quantityAfter,
          quantityChange: change.quantityChange,
          operation: change.operation
        })),
        totalPartsAffected: stockChanges.length
      },
      metadata: {
        source: 'atomic_operations',
        batchOperation: stockChanges.length > 1
      }
    })
  }

  /**
   * Record error or failure
   * @param {String} action - Action that failed
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   * @returns {Promise<String>} Audit entry ID
   */
  static async recordError(action, error, context = {}) {
    return this.recordEntry({
      action: 'error_occurred',
      category: 'error_tracking',
      invoiceId: context.invoiceId || null,
      details: {
        failedAction: action,
        errorMessage: error.message,
        errorStack: error.stack,
        errorCode: error.code,
        context,
        recoveryAction: context.recoveryAction || 'none'
      },
      metadata: {
        source: 'error_handler',
        severity: context.severity || 'medium',
        userImpact: context.userImpact || 'operation_failed'
      }
    })
  }

  /**
   * Get audit history for an invoice
   * @param {String} invoiceId - Invoice ID
   * @param {Number} limitCount - Max entries to return
   * @returns {Promise<Array>} Audit entries
   */
  static async getInvoiceAuditHistory(invoiceId, limitCount = 50) {
    try {
      const q = query(
        collection(db, 'audit_trail'),
        where('invoiceId', '==', invoiceId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

    } catch (error) {
      console.error('Failed to fetch audit history:', error)
      return []
    }
  }

  /**
   * Get recent audit entries (dashboard view)
   * @param {Number} limitCount - Max entries to return
   * @returns {Promise<Array>} Recent audit entries
   */
  static async getRecentAuditEntries(limitCount = 100) {
    try {
      const q = query(
        collection(db, 'audit_trail'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

    } catch (error) {
      console.error('Failed to fetch recent audit entries:', error)
      return []
    }
  }

  // Helper Methods

  /**
   * Calculate changes between two invoice versions
   * @param {Object} original - Original invoice
   * @param {Object} updated - Updated invoice
   * @returns {Object} Changes summary
   */
  static calculateChanges(original, updated) {
    const changes = {
      customerInfo: false,
      items: false,
      notes: false,
      totalChanges: 0
    }

    // Check customer info changes
    if (JSON.stringify(original.customerInfo) !== JSON.stringify(updated.customerInfo)) {
      changes.customerInfo = true
      changes.totalChanges++
    }

    // Check items changes
    if (JSON.stringify(original.items) !== JSON.stringify(updated.items)) {
      changes.items = true
      changes.totalChanges++
    }

    // Check notes changes
    if (original.notes !== updated.notes) {
      changes.notes = true
      changes.totalChanges++
    }

    return changes
  }

  /**
   * Compare customer info between versions
   * @param {Object} original - Original customer info
   * @param {Object} updated - Updated customer info
   * @returns {Object} Customer info changes
   */
  static compareCustomerInfo(original, updated) {
    if (!original && !updated) return null
    if (!original) return { added: updated }
    if (!updated) return { removed: original }

    const changes = {}
    const fields = ['name', 'contact', 'address']

    for (const field of fields) {
      if (original[field] !== updated[field]) {
        changes[field] = {
          from: original[field],
          to: updated[field]
        }
      }
    }

    return Object.keys(changes).length > 0 ? changes : null
  }

  /**
   * Compare items between versions
   * @param {Array} originalItems - Original items
   * @param {Array} updatedItems - Updated items
   * @returns {Object} Items changes
   */
  static compareItems(originalItems = [], updatedItems = []) {
    const changes = {
      added: [],
      removed: [],
      modified: []
    }

    const originalMap = new Map(originalItems.map(item => [item.partId, item]))
    const updatedMap = new Map(updatedItems.map(item => [item.partId, item]))

    // Find added items
    for (const [partId, item] of updatedMap) {
      if (!originalMap.has(partId)) {
        changes.added.push({
          partId,
          partName: item.namaProduk,
          quantity: item.quantity,
          unitPrice: item.finalPrice
        })
      }
    }

    // Find removed items
    for (const [partId, item] of originalMap) {
      if (!updatedMap.has(partId)) {
        changes.removed.push({
          partId,
          partName: item.namaProduk,
          quantity: item.quantity,
          unitPrice: item.finalPrice
        })
      }
    }

    // Find modified items
    for (const [partId, originalItem] of originalMap) {
      const updatedItem = updatedMap.get(partId)
      if (updatedItem) {
        const itemChanges = {}
        
        if (originalItem.quantity !== updatedItem.quantity) {
          itemChanges.quantity = {
            from: originalItem.quantity,
            to: updatedItem.quantity
          }
        }
        
        if (Math.abs(originalItem.finalPrice - updatedItem.finalPrice) > 0.01) {
          itemChanges.unitPrice = {
            from: originalItem.finalPrice,
            to: updatedItem.finalPrice
          }
        }

        if (Object.keys(itemChanges).length > 0) {
          changes.modified.push({
            partId,
            partName: originalItem.namaProduk,
            changes: itemChanges
          })
        }
      }
    }

    return changes
  }

  /**
   * Generate unique edit session ID
   * @returns {String} Session ID
   */
  static generateEditSessionId() {
    return `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get current session ID
   * @returns {String} Session ID
   */
  static getSessionId() {
    if (!window.sessionStorage.getItem('audit_session_id')) {
      window.sessionStorage.setItem('audit_session_id', 
        `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      )
    }
    return window.sessionStorage.getItem('audit_session_id')
  }

  /**
   * Get edit duration (if edit session active)
   * @returns {Number} Duration in milliseconds
   */
  static getEditDuration() {
    const startTime = window.sessionStorage.getItem('edit_start_time')
    if (startTime) {
      return Date.now() - parseInt(startTime)
    }
    return 0
  }

  /**
   * Get client IP address (for compliance)
   * @returns {Promise<String>} IP address
   */
  static async getClientIP() {
    try {
      // In production, you might want to use a proper IP service
      // For now, return a placeholder
      return 'client_ip_not_available'
    } catch (error) {
      return 'ip_detection_failed'
    }
  }

  /**
   * Format audit entry for display
   * @param {Object} entry - Audit entry
   * @returns {Object} Formatted entry
   */
  static formatForDisplay(entry) {
    return {
      id: entry.id,
      action: this.formatActionName(entry.action),
      timestamp: entry.timestamp,
      invoiceId: entry.invoiceId,
      invoiceNumber: entry.invoiceNumber,
      category: entry.category,
      summary: this.generateSummary(entry),
      details: entry.details,
      metadata: entry.metadata
    }
  }

  /**
   * Format action name for display
   * @param {String} action - Action name
   * @returns {String} Formatted action
   */
  static formatActionName(action) {
    const actionMap = {
      'invoice_created': 'Invoice Created',
      'invoice_edit_started': 'Edit Started',
      'invoice_edit_completed': 'Edit Completed',
      'invoice_deleted': 'Invoice Deleted',
      'stock_updated': 'Stock Updated',
      'stock_restored': 'Stock Restored',
      'error_occurred': 'Error Occurred'
    }
    
    return actionMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  /**
   * Generate summary text for audit entry
   * @param {Object} entry - Audit entry
   * @returns {String} Summary text
   */
  static generateSummary(entry) {
    switch (entry.action) {
      case 'invoice_created':
        return `Created invoice for ${entry.details?.customerName} with ${entry.details?.itemCount} items (RM ${entry.details?.totalAmount})`
      
      case 'invoice_edit_completed':
        return `Updated invoice ${entry.invoiceNumber} - ${entry.details?.changesApplied?.totalChanges} changes made`
      
      case 'invoice_deleted':
        return `Deleted invoice ${entry.invoiceNumber} - ${entry.details?.itemsRestored?.length} items restored to stock`
      
      case 'stock_updated':
        return `Updated stock for ${entry.details?.totalPartsAffected} parts`
      
      case 'error_occurred':
        return `Error in ${entry.details?.failedAction}: ${entry.details?.errorMessage}`
      
      default:
        return `${this.formatActionName(entry.action)} - ${entry.invoiceNumber || 'N/A'}`
    }
  }
}

export default AuditTrail
