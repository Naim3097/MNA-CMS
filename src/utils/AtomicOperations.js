/**
 * Atomic Operations Manager
 * Ensures all-or-nothing updates for invoice edits with stock reconciliation
 * Enhanced with conflict resolution, audit trail, and performance optimization
 */

import { doc, writeBatch, getDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import StockReconciliation from './StockReconciliation.js'
import InvoiceEditValidator from './InvoiceEditValidator.js'
import ConflictResolver from './ConflictResolver.js'
import AuditTrail from './AuditTrail.js'
import PerformanceOptimizer from './PerformanceOptimizer.js'
import { createContextualError, ValidationErrorType } from '../types/InvoiceTypes.js'

export class AtomicOperations {
  
  /**
   * Execute atomic invoice edit with stock reconciliation
   * @param {String} invoiceId - Invoice to edit
   * @param {Object} modifiedInvoice - Modified invoice data
   * @param {Array} currentParts - Current parts inventory
   * @param {Object} originalInvoice - Original invoice for comparison
   * @returns {Promise<Object>} Operation result
   */
  static async executeInvoiceEdit(invoiceId, modifiedInvoice, currentParts, originalInvoice) {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Enhanced with performance monitoring
    return PerformanceOptimizer.monitorPerformance('invoice_edit_atomic', async () => {
      
      try {
        // Step 0: Pre-flight conflict check
        const conflictCheck = await ConflictResolver.checkForConflictsBeforeSave(
          invoiceId, 
          originalInvoice.version || 1
        )

        if (conflictCheck.hasConflicts) {
          // Record conflict in audit trail
          await AuditTrail.recordError('invoice_edit_conflict', new Error('Concurrent edit detected'), {
            invoiceId,
            conflicts: conflictCheck.conflicts,
            severity: 'high',
            userImpact: 'operation_blocked',
            operationId
          })

          return {
            success: false,
            error: 'Concurrent edit detected',
            conflicts: conflictCheck.conflicts,
            operationId
          }
        }

        // Step 1: Analyze the changes
        const analysis = StockReconciliation.analyzeInvoiceEdit(
          originalInvoice, 
          modifiedInvoice, 
          currentParts
        )

        // Step 2: Validate all changes
        if (!analysis.validation.isValid) {
          // Record validation failure
          await AuditTrail.recordError('invoice_edit_validation_failed', new Error('Validation failed'), {
            invoiceId,
            validationErrors: analysis.validation,
            severity: 'medium',
            operationId
          })

          return {
            success: false,
            error: 'Validation failed',
            details: analysis.validation,
            operationId
          }
        }

        // Record edit start
        await AuditTrail.recordEditStart(invoiceId, originalInvoice)

        // Step 3: Create Firebase batch
        const batch = writeBatch(db)
        const timestamp = new Date()

        // Step 4: Update invoice with enhanced metadata
        const invoiceRef = doc(db, 'invoices', invoiceId)
        const updatedInvoice = {
          ...modifiedInvoice,
          dateCreated: originalInvoice.dateCreated || modifiedInvoice.dateCreated || timestamp, // Preserve original date
          updatedAt: timestamp,
          editCount: (originalInvoice.editCount || 0) + 1,
          lastEditedAt: timestamp,
          version: (originalInvoice.version || 1) + 1,
          lastEditSession: {
            operationId,
            sessionId: AuditTrail.getSessionId(),
            timestamp,
            editType: 'advanced_edit'
          }
        }
        batch.set(invoiceRef, updatedInvoice, { merge: true })

        // Step 5: Update affected parts stock with enhanced tracking
        const stockUpdates = []
        for (const stockUpdate of analysis.stockUpdates) {
          const partRef = doc(db, 'parts', stockUpdate.partId)
          batch.update(partRef, {
            unitStock: stockUpdate.newStock,
            updatedAt: timestamp,
            lastStockChange: {
              reason: 'invoice_edit',
              invoiceId,
              change: stockUpdate.stockChange,
              timestamp,
              operationId
            }
          })

          stockUpdates.push({
            partId: stockUpdate.partId,
            partName: stockUpdate.partName || 'Unknown',
            quantityBefore: stockUpdate.oldStock,
            quantityAfter: stockUpdate.newStock,
            quantityChange: stockUpdate.stockChange,
            operation: stockUpdate.stockChange > 0 ? 'restore' : 'allocate'
          })
        }

        // Step 6: Create audit trail entries
        for (const auditEntry of analysis.auditTrail) {
          const auditRef = doc(db, 'audit_trail', auditEntry.id)
          batch.set(auditRef, {
            ...auditEntry,
            operationId,
            createdAt: timestamp
          })
        }

        // Step 7: Execute atomic batch
        await batch.commit()

        // Step 8: Record successful completion
        await AuditTrail.recordEditCompletion(
          invoiceId,
          originalInvoice,
          updatedInvoice,
          stockUpdates
        )

        // Clear performance cache
        PerformanceOptimizer.clearCache()

        // Step 9: Return success with enhanced details
        return {
          success: true,
          operationId,
          analysis,
          invoice: updatedInvoice,
          stockChanges: stockUpdates,
          operationMetrics: {
            stockItemsAffected: stockUpdates.length,
            validationPassed: true,
            conflictsResolved: 0,
            executionTime: performance.now()
          }
        }

      } catch (error) {
        // Record operation failure
        await AuditTrail.recordError('atomic_invoice_edit_failed', error, {
          invoiceId,
          operationId,
          severity: 'high',
          userImpact: 'operation_failed',
          recoveryAction: 'retry_or_reload'
        })

        console.error(`Atomic operation ${operationId} failed:`, error)
        
        return {
          success: false,
          error: error.message,
          operationId,
          details: error,
          suggestion: 'Please try again or contact support if the problem persists'
        }
      }
    })
  }

  /**
   * Delete invoice with stock restoration
   * @param {String} invoiceId - Invoice to delete
   * @param {Object} invoice - Invoice data
   * @param {Array} currentParts - Current parts inventory
   * @returns {Promise<Object>} Operation result
   */
  static async deleteInvoiceWithStockRestoration(invoiceId, invoice, currentParts) {
    const operationId = `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      // Step 1: Calculate stock restoration needed
      const stockRestorations = invoice.items.map(item => ({
        partId: item.partId,
        quantityToRestore: item.quantity,
        reason: 'invoice_deletion',
        originalItem: item
      }))

      // Step 2: Validate parts still exist
      const partsMap = new Map(currentParts.map(part => [part.id, part]))
      const missingParts = stockRestorations.filter(resto => !partsMap.has(resto.partId))
      
      if (missingParts.length > 0) {
        console.warn(`Some parts from deleted invoice no longer exist:`, missingParts)
        // Continue anyway - we can't restore stock for non-existent parts
      }

      // Step 3: Create Firebase batch
      const batch = writeBatch(db)
      const timestamp = new Date()

      // Step 4: Delete invoice
      const invoiceRef = doc(db, 'invoices', invoiceId)
      batch.delete(invoiceRef)

      // Step 5: Restore stock for existing parts
      for (const restoration of stockRestorations) {
        const part = partsMap.get(restoration.partId)
        if (part) {
          const partRef = doc(db, 'parts', restoration.partId)
          batch.update(partRef, {
            unitStock: part.unitStock + restoration.quantityToRestore,
            updatedAt: timestamp,
            lastStockChange: {
              reason: 'invoice_deletion',
              invoiceId,
              change: restoration.quantityToRestore,
              timestamp,
              operationId
            }
          })
        }
      }

      // Step 6: Create deletion audit entry
      const auditRef = doc(db, 'audit_trail', `audit_delete_${operationId}`)
      batch.set(auditRef, {
        id: `audit_delete_${operationId}`,
        invoiceId,
        userId: 'system',
        action: 'invoice_deleted',
        timestamp,
        operationId,
        details: {
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          itemCount: invoice.items.length,
          stockRestorations: stockRestorations.map(r => ({
            partId: r.partId,
            partName: r.originalItem.namaProduk,
            quantityRestored: r.quantityToRestore
          }))
        },
        createdAt: timestamp
      })

      // Step 7: Execute atomic batch
      await batch.commit()

      return {
        success: true,
        operationId,
        message: `Invoice ${invoice.invoiceNumber} deleted successfully`,
        details: {
          stockRestored: stockRestorations.length,
          missingParts: missingParts.length
        }
      }

    } catch (error) {
      console.error(`Delete operation ${operationId} failed:`, error)
      
      return {
        success: false,
        error: error.message,
        operationId,
        details: error,
        suggestion: 'Please try again or contact support if the problem persists'
      }
    }
  }

  /**
   * Validate transaction before execution
   * @param {Array} operations - Operations to validate
   * @returns {Promise<Object>} Validation result
   */
  static async validateTransaction(operations) {
    try {
      const validationResults = []
      
      for (const operation of operations) {
        switch (operation.type) {
          case 'update_invoice':
            const invoiceValidation = InvoiceEditValidator.validateInvoiceIntegrity(
              operation.data, 
              operation.parts
            )
            validationResults.push({
              operation: operation.type,
              valid: invoiceValidation.isValid,
              errors: invoiceValidation.errors,
              warnings: invoiceValidation.warnings
            })
            break
            
          case 'update_stock':
            if (operation.newStock < 0) {
              validationResults.push({
                operation: operation.type,
                valid: false,
                errors: [createContextualError(
                  ValidationErrorType.INSUFFICIENT_STOCK,
                  `Stock cannot be negative for part ${operation.partId}`,
                  { partId: operation.partId, newStock: operation.newStock }
                )]
              })
            }
            break
            
          default:
            validationResults.push({
              operation: operation.type,
              valid: true,
              errors: [],
              warnings: []
            })
        }
      }

      const allValid = validationResults.every(result => result.valid)
      const allErrors = validationResults.flatMap(result => result.errors)
      const allWarnings = validationResults.flatMap(result => result.warnings)

      return {
        isValid: allValid,
        errors: allErrors,
        warnings: allWarnings,
        validationResults
      }

    } catch (error) {
      return {
        isValid: false,
        errors: [createContextualError(
          'VALIDATION_ERROR',
          `Validation failed: ${error.message}`,
          { error }
        )],
        warnings: []
      }
    }
  }

  /**
   * Rollback changes (best effort - Firebase batches are atomic)
   * @param {String} operationId - Operation to rollback
   * @returns {Promise<Object>} Rollback result
   */
  static async rollbackChanges(operationId) {
    try {
      // In a real implementation, this would:
      // 1. Find all changes made by this operation ID
      // 2. Reverse each change
      // 3. Create rollback audit entries
      
      // For now, we log the attempt since Firebase batches are atomic
      console.warn(`Attempting rollback for operation ${operationId}`)
      
      // Create rollback audit entry
      const auditRef = doc(db, 'audit_trail', `rollback_${operationId}`)
      await auditRef.set({
        id: `rollback_${operationId}`,
        originalOperationId: operationId,
        action: 'rollback_attempted',
        timestamp: new Date(),
        success: false, // We can't actually rollback Firebase batches
        reason: 'Firebase batches are atomic - no manual rollback needed'
      })

      return {
        success: true,
        message: `Rollback logged for operation ${operationId}`,
        note: 'Firebase batches are atomic, so failed operations are automatically rolled back'
      }

    } catch (error) {
      console.error(`Rollback logging failed for operation ${operationId}:`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Check if operation is still valid (for handling concurrent edits)
   * @param {String} invoiceId - Invoice ID
   * @param {Number} expectedVersion - Expected version number
   * @returns {Promise<Object>} Validity check result
   */
  static async checkOperationValidity(invoiceId, expectedVersion) {
    try {
      const invoiceDoc = await getDoc(doc(db, 'invoices', invoiceId))
      
      if (!invoiceDoc.exists()) {
        return {
          valid: false,
          reason: 'Invoice no longer exists',
          action: 'refresh_and_retry'
        }
      }

      const currentVersion = invoiceDoc.data().version || 1
      if (currentVersion !== expectedVersion) {
        return {
          valid: false,
          reason: 'Invoice has been modified by another user',
          currentVersion,
          expectedVersion,
          action: 'merge_or_reload'
        }
      }

      return {
        valid: true,
        currentVersion
      }

    } catch (error) {
      return {
        valid: false,
        reason: `Error checking validity: ${error.message}`,
        action: 'retry_later'
      }
    }
  }
}

export default AtomicOperations
