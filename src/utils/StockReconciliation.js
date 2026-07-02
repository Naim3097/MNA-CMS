/**
 * Stock Reconciliation Engine
 * Pure functions for calculating stock changes during invoice edits
 */

import { 
  StockChangeType, 
  createStockChange, 
  createValidationResult,
  ValidationErrorType,
  createContextualError 
} from '../types/InvoiceTypes.js'

export class StockReconciliation {
  
  /**
   * Calculate stock changes between original and edited invoice
   * @param {Object} originalInvoice - Original invoice
   * @param {Object} editedInvoice - Edited invoice
   * @returns {Object} Stock changes (partId -> net change)
   */
  static calculateStockChanges(originalInvoice, editedInvoice) {
    const stockChanges = {}
    
    // Create maps for efficient lookup
    const originalParts = new Map(originalInvoice.parts.map(p => [p.partId, p.quantity]))
    const editedParts = new Map(editedInvoice.parts.map(p => [p.partId, p.quantity]))
    
    // Get all unique part IDs
    const allPartIds = new Set([...originalParts.keys(), ...editedParts.keys()])
    
    for (const partId of allPartIds) {
      const originalQty = originalParts.get(partId) || 0
      const editedQty = editedParts.get(partId) || 0
      const netChange = originalQty - editedQty // Positive = return to stock, Negative = consume from stock
      stockChanges[partId] = netChange
    }
    
    return stockChanges
  }

  /**
   * Restore stock for deleted invoice
   * @param {Object} invoice - Deleted invoice
   * @returns {Object} Stock changes to restore
   */
  static restoreStockForDeletedInvoice(invoice) {
    const stockChanges = {}
    
    for (const part of invoice.parts) {
      stockChanges[part.partId] = part.quantity // Return all quantities to stock
    }
    
    return stockChanges
  }

  /**
   * Validate if stock changes are possible given current stock levels
   * @param {Object|Map} stockChanges - Net stock changes
   * @param {Array} parts - Current parts with stock levels
   * @returns {Object} Validation result
   */
  static validateStockAvailability(stockChanges, parts) {
    const issues = []
    const partsMap = new Map(parts.map(part => [part.id, part]))

    // Convert to entries if it's a Map, otherwise use Object.entries
    const changes = stockChanges instanceof Map 
      ? Array.from(stockChanges.entries())
      : Object.entries(stockChanges)

    for (const [partId, netChange] of changes) {
      const part = partsMap.get(partId)
      
      if (!part) {
        issues.push({
          partId,
          issue: 'Part not found',
          available: 0,
          needed: Math.abs(netChange)
        })
        continue
      }

      // Check if we need more stock than available (negative change means consume stock)
      if (netChange < 0) {
        const needed = Math.abs(netChange)
        const available = part.quantity || part.unitStock || 0
        
        if (available < needed) {
          issues.push({
            partId,
            partName: part.name || part.namaProduk,
            issue: 'Insufficient stock',
            available,
            needed,
            shortfall: needed - available
          })
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
  
  /**
   * Calculate differences between original and new invoice items
   * @param {Array} originalItems - Original invoice items
   * @param {Array} newItems - Modified invoice items
   * @returns {Object} Categorized changes
   */
  static calculateDifferences(originalItems, newItems) {
    const changes = {
      additions: [],     // Completely new parts
      removals: [],      // Parts completely removed
      modifications: [], // Quantity or price changes
      unchanged: []      // No changes (for reference)
    }

    // Create lookup maps for efficient comparison
    const originalMap = new Map(originalItems.map(item => [item.partId, item]))
    const newMap = new Map(newItems.map(item => [item.partId, item]))

    // Find additions (parts in new but not in original)
    for (const [partId, newItem] of newMap) {
      if (!originalMap.has(partId)) {
        changes.additions.push({
          type: StockChangeType.ADD_PART,
          partId,
          item: newItem,
          stockChange: createStockChange(partId, StockChangeType.ADD_PART, 0, newItem.quantity, newItem)
        })
      }
    }

    // Find removals and modifications
    for (const [partId, originalItem] of originalMap) {
      if (!newMap.has(partId)) {
        // Part removed
        changes.removals.push({
          type: StockChangeType.REMOVE_PART,
          partId,
          item: originalItem,
          stockChange: createStockChange(partId, StockChangeType.REMOVE_PART, originalItem.quantity, 0, originalItem)
        })
      } else {
        // Part exists in both, check for changes
        const newItem = newMap.get(partId)
        const hasQuantityChange = originalItem.quantity !== newItem.quantity
        const hasPriceChange = originalItem.finalPrice !== newItem.finalPrice
        const hasMarkupChange = originalItem.markupValue !== newItem.markupValue || 
                               originalItem.markupType !== newItem.markupType

        if (hasQuantityChange || hasPriceChange || hasMarkupChange) {
          const changeType = originalItem.quantity < newItem.quantity 
            ? StockChangeType.INCREASE_QTY 
            : StockChangeType.DECREASE_QTY

          changes.modifications.push({
            type: changeType,
            partId,
            originalItem,
            newItem,
            changes: {
              quantity: hasQuantityChange,
              price: hasPriceChange,
              markup: hasMarkupChange
            },
            stockChange: createStockChange(partId, changeType, originalItem.quantity, newItem.quantity, newItem)
          })
        } else {
          changes.unchanged.push({
            partId,
            item: originalItem
          })
        }
      }
    }

    return changes
  }

  /**
   * Calculate net stock impact for all changes
   * @param {Object} differences - Result from calculateDifferences
   * @returns {Map} Map of partId -> net stock change
   */
  static calculateNetStockImpact(differences) {
    const stockImpact = new Map()

    // Process additions
    differences.additions.forEach(addition => {
      const { partId, stockChange } = addition
      stockImpact.set(partId, (stockImpact.get(partId) || 0) + stockChange.netChange)
    })

    // Process removals
    differences.removals.forEach(removal => {
      const { partId, stockChange } = removal
      stockImpact.set(partId, (stockImpact.get(partId) || 0) + stockChange.netChange)
    })

    // Process modifications
    differences.modifications.forEach(modification => {
      const { partId, stockChange } = modification
      stockImpact.set(partId, (stockImpact.get(partId) || 0) + stockChange.netChange)
    })

    return stockImpact
  }

  /**
   * Validate if stock changes are possible given current stock levels
   * @param {Map} stockImpact - Net stock changes
   * @param {Array} parts - Current parts with stock levels
   * @returns {Object} Validation result
   */
  static validateStockAvailability(stockImpact, parts) {
    const errors = []
    const warnings = []
    const partsMap = new Map(parts.map(part => [part.id, part]))

    for (const [partId, netChange] of stockImpact) {
      const part = partsMap.get(partId)
      
      if (!part) {
        errors.push(createContextualError(
          ValidationErrorType.PART_NOT_FOUND,
          `Part with ID ${partId} no longer exists`,
          { partId, suggestedAction: 'Remove this part from the invoice' }
        ))
        continue
      }

      // Check if we need more stock than available
      if (netChange < 0) { // Negative means we need to reduce stock
        const requiredStock = Math.abs(netChange)
        if (part.unitStock < requiredStock) {
          errors.push(createContextualError(
            ValidationErrorType.INSUFFICIENT_STOCK,
            `Insufficient stock for ${part.namaProduk}. Required: ${requiredStock}, Available: ${part.unitStock}`,
            { 
              partId, 
              partName: part.namaProduk,
              required: requiredStock,
              available: part.unitStock,
              shortage: requiredStock - part.unitStock
            }
          ))
        } else if (part.unitStock - requiredStock <= 10) { // Low stock warning
          warnings.push(createContextualError(
            'LOW_STOCK_WARNING',
            `${part.namaProduk} will have low stock (${part.unitStock - requiredStock}) after this change`,
            { 
              partId, 
              partName: part.namaProduk,
              remainingStock: part.unitStock - requiredStock
            }
          ))
        }
      }
    }

    return createValidationResult(errors.length === 0, errors, warnings)
  }

  /**
   * Generate atomic stock updates for Firebase
   * @param {Map} stockImpact - Net stock changes
   * @param {Array} parts - Current parts
   * @returns {Array} Batch update operations
   */
  static generateStockUpdates(stockImpact, parts) {
    const updates = []
    const partsMap = new Map(parts.map(part => [part.id, part]))

    for (const [partId, netChange] of stockImpact) {
      const part = partsMap.get(partId)
      if (!part) continue // Skip if part doesn't exist

      const newStock = Math.max(0, part.unitStock + netChange)
      updates.push({
        partId,
        currentStock: part.unitStock,
        stockChange: netChange,
        newStock,
        operation: 'update',
        metadata: {
          reason: 'invoice_edit',
          timestamp: new Date(),
          previousStock: part.unitStock
        }
      })
    }

    return updates
  }

  /**
   * Create audit trail entries for stock changes
   * @param {Object} differences - Stock differences
   * @param {String} invoiceId - Invoice being edited
   * @param {String} userId - User making changes
   * @returns {Array} Audit entries
   */
  static createAuditTrail(differences, invoiceId, userId = 'system') {
    const auditEntries = []

    // Audit additions
    differences.additions.forEach(addition => {
      auditEntries.push({
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        invoiceId,
        userId,
        action: 'part_added',
        timestamp: new Date(),
        details: {
          partId: addition.partId,
          partName: addition.item.namaProduk,
          quantity: addition.item.quantity,
          stockImpact: addition.stockChange.netChange
        }
      })
    })

    // Audit removals
    differences.removals.forEach(removal => {
      auditEntries.push({
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        invoiceId,
        userId,
        action: 'part_removed',
        timestamp: new Date(),
        details: {
          partId: removal.partId,
          partName: removal.item.namaProduk,
          quantity: removal.item.quantity,
          stockImpact: removal.stockChange.netChange
        }
      })
    })

    // Audit modifications
    differences.modifications.forEach(modification => {
      auditEntries.push({
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        invoiceId,
        userId,
        action: 'part_modified',
        timestamp: new Date(),
        details: {
          partId: modification.partId,
          partName: modification.newItem.namaProduk,
          oldQuantity: modification.originalItem.quantity,
          newQuantity: modification.newItem.quantity,
          stockImpact: modification.stockChange.netChange,
          changes: modification.changes
        }
      })
    })

    return auditEntries
  }

  /**
   * Comprehensive invoice edit analysis
   * @param {Object} originalInvoice - Original invoice
   * @param {Object} modifiedInvoice - Modified invoice
   * @param {Array} parts - Current parts inventory
   * @returns {Object} Complete analysis
   */
  static analyzeInvoiceEdit(originalInvoice, modifiedInvoice, parts) {
    const differences = this.calculateDifferences(originalInvoice.items, modifiedInvoice.items)
    const stockImpact = this.calculateNetStockImpact(differences)
    const validation = this.validateStockAvailability(stockImpact, parts)
    const stockUpdates = this.generateStockUpdates(stockImpact, parts)
    const auditTrail = this.createAuditTrail(differences, originalInvoice.id)

    return {
      differences,
      stockImpact,
      validation,
      stockUpdates,
      auditTrail,
      summary: {
        totalPartsAdded: differences.additions.length,
        totalPartsRemoved: differences.removals.length,
        totalPartsModified: differences.modifications.length,
        totalStockAffected: stockImpact.size,
        isValid: validation.isValid,
        hasWarnings: validation.warnings.length > 0
      }
    }
  }
}

export default StockReconciliation
