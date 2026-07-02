/**
 * Conflict Resolution System
 * Handles concurrent edits and data conflicts with user-friendly resolution options
 */

import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { createContextualError } from '../types/InvoiceTypes'

export class ConflictResolver {
  
  /**
   * Detect conflicts between local and remote invoice data
   * @param {Object} localInvoice - Local version of invoice
   * @param {Object} remoteInvoice - Remote version from Firebase
   * @returns {Object} Conflict analysis
   */
  static detectConflicts(localInvoice, remoteInvoice) {
    const conflicts = []
    const warnings = []

    // Version conflict (most critical)
    if (localInvoice.version && remoteInvoice.version) {
      if (remoteInvoice.version > localInvoice.version) {
        conflicts.push({
          type: 'version_conflict',
          field: 'version',
          local: localInvoice.version,
          remote: remoteInvoice.version,
          message: 'This invoice has been modified by another user',
          severity: 'critical',
          resolutionOptions: ['reload', 'merge', 'overwrite']
        })
      }
    }

    // Item conflicts
    const localItems = new Map(localInvoice.items?.map(item => [item.partId, item]) || [])
    const remoteItems = new Map(remoteInvoice.items?.map(item => [item.partId, item]) || [])

    // Check for item modifications
    for (const [partId, localItem] of localItems) {
      const remoteItem = remoteItems.get(partId)
      if (remoteItem) {
        if (localItem.quantity !== remoteItem.quantity) {
          conflicts.push({
            type: 'quantity_conflict',
            field: 'items',
            partId,
            partName: localItem.namaProduk,
            local: localItem.quantity,
            remote: remoteItem.quantity,
            message: `Quantity conflict for ${localItem.namaProduk}`,
            severity: 'high',
            resolutionOptions: ['use_local', 'use_remote', 'manual']
          })
        }

        if (Math.abs(localItem.finalPrice - remoteItem.finalPrice) > 0.01) {
          warnings.push({
            type: 'price_conflict',
            field: 'items',
            partId,
            partName: localItem.namaProduk,
            local: localItem.finalPrice,
            remote: remoteItem.finalPrice,
            message: `Price difference for ${localItem.namaProduk}`,
            severity: 'medium'
          })
        }
      }
    }

    // Check for added/removed items
    for (const [partId, remoteItem] of remoteItems) {
      if (!localItems.has(partId)) {
        warnings.push({
          type: 'item_added_remotely',
          field: 'items',
          partId,
          partName: remoteItem.namaProduk,
          message: `${remoteItem.namaProduk} was added by another user`,
          severity: 'medium'
        })
      }
    }

    for (const [partId, localItem] of localItems) {
      if (!remoteItems.has(partId)) {
        warnings.push({
          type: 'item_removed_remotely',
          field: 'items',
          partId,
          partName: localItem.namaProduk,
          message: `${localItem.namaProduk} was removed by another user`,
          severity: 'medium'
        })
      }
    }

    // Customer info conflicts
    if (localInvoice.customerInfo && remoteInvoice.customerInfo) {
      const fields = ['name', 'contact', 'address']
      for (const field of fields) {
        if (localInvoice.customerInfo[field] !== remoteInvoice.customerInfo[field]) {
          warnings.push({
            type: 'customer_info_conflict',
            field: `customerInfo.${field}`,
            local: localInvoice.customerInfo[field],
            remote: remoteInvoice.customerInfo[field],
            message: `Customer ${field} has been modified`,
            severity: 'low'
          })
        }
      }
    }

    // Notes conflict
    if (localInvoice.notes !== remoteInvoice.notes) {
      warnings.push({
        type: 'notes_conflict',
        field: 'notes',
        local: localInvoice.notes,
        remote: remoteInvoice.notes,
        message: 'Invoice notes have been modified',
        severity: 'low'
      })
    }

    return {
      hasConflicts: conflicts.length > 0,
      hasWarnings: warnings.length > 0,
      conflicts,
      warnings,
      severity: conflicts.length > 0 ? 'critical' : warnings.length > 0 ? 'medium' : 'none',
      resolutionRequired: conflicts.length > 0
    }
  }

  /**
   * Generate resolution strategies for conflicts
   * @param {Object} conflictAnalysis - Result from detectConflicts
   * @param {Object} localInvoice - Local version
   * @param {Object} remoteInvoice - Remote version
   * @returns {Array} Resolution strategies
   */
  static generateResolutionStrategies(conflictAnalysis, localInvoice, remoteInvoice) {
    if (!conflictAnalysis.hasConflicts) {
      return [{
        id: 'no_conflict',
        name: 'Proceed with Save',
        description: 'No conflicts detected, safe to proceed',
        risk: 'none',
        recommended: true
      }]
    }

    const strategies = []

    // Strategy 1: Reload and restart
    strategies.push({
      id: 'reload',
      name: 'Reload and Start Over',
      description: 'Discard your changes and reload the latest version',
      risk: 'low',
      pros: ['Always safe', 'No data corruption'],
      cons: ['Lose your changes', 'Need to start editing again'],
      action: 'reload_invoice',
      recommended: false
    })

    // Strategy 2: Force overwrite (dangerous)
    if (conflictAnalysis.severity === 'critical') {
      strategies.push({
        id: 'force_overwrite',
        name: 'Force Overwrite',
        description: 'Save your changes and overwrite the remote version',
        risk: 'high',
        pros: ['Keep your changes'],
        cons: ['May lose other user\'s changes', 'Risk of data inconsistency'],
        action: 'force_save',
        recommended: false,
        requiresConfirmation: true
      })
    }

    // Strategy 3: Smart merge (when possible)
    if (this.canAutoMerge(conflictAnalysis)) {
      strategies.push({
        id: 'auto_merge',
        name: 'Automatic Merge',
        description: 'Automatically merge compatible changes',
        risk: 'medium',
        pros: ['Keep both sets of changes', 'Automatic resolution'],
        cons: ['May not handle all conflicts perfectly'],
        action: 'auto_merge',
        recommended: true
      })
    }

    // Strategy 4: Manual resolution
    if (conflictAnalysis.conflicts.length <= 5) { // Only for manageable number of conflicts
      strategies.push({
        id: 'manual_resolve',
        name: 'Manual Resolution',
        description: 'Review and resolve each conflict individually',
        risk: 'low',
        pros: ['Full control', 'Best outcome', 'Review all changes'],
        cons: ['Takes more time', 'Requires careful review'],
        action: 'show_resolution_ui',
        recommended: true
      })
    }

    return strategies
  }

  /**
   * Check if conflicts can be automatically merged
   * @param {Object} conflictAnalysis - Conflict analysis
   * @returns {Boolean} Can auto-merge
   */
  static canAutoMerge(conflictAnalysis) {
    // Can auto-merge if:
    // 1. No critical version conflicts
    // 2. No quantity conflicts (stock sensitive)
    // 3. Only minor field changes

    const criticalConflicts = conflictAnalysis.conflicts.filter(conflict => 
      conflict.severity === 'critical' || 
      conflict.type === 'version_conflict' ||
      conflict.type === 'quantity_conflict'
    )

    return criticalConflicts.length === 0
  }

  /**
   * Perform automatic merge of compatible changes
   * @param {Object} localInvoice - Local version
   * @param {Object} remoteInvoice - Remote version
   * @param {Object} conflictAnalysis - Conflict analysis
   * @returns {Object} Merged invoice
   */
  static autoMerge(localInvoice, remoteInvoice, conflictAnalysis) {
    if (!this.canAutoMerge(conflictAnalysis)) {
      throw new Error('Cannot auto-merge: critical conflicts exist')
    }

    // Start with remote version (latest)
    const merged = { ...remoteInvoice }

    // Apply local changes that don't conflict
    merged.items = this.mergeItems(localInvoice.items, remoteInvoice.items, conflictAnalysis)
    
    // Merge customer info (prefer local changes for editable fields)
    if (localInvoice.customerInfo) {
      merged.customerInfo = {
        ...remoteInvoice.customerInfo,
        ...localInvoice.customerInfo
      }
    }

    // Merge notes (prefer local if modified)
    if (localInvoice.notes && localInvoice.notes !== remoteInvoice.notes) {
      merged.notes = localInvoice.notes
    }

    // Recalculate totals
    merged.subtotal = merged.items.reduce((sum, item) => sum + item.totalPrice, 0)
    merged.totalAmount = merged.subtotal

    // Update metadata
    merged.version = (remoteInvoice.version || 1) + 1
    merged.lastMerged = new Date()
    merged.mergeSource = 'auto_merge'

    return merged
  }

  /**
   * Merge item arrays intelligently
   * @param {Array} localItems - Local items
   * @param {Array} remoteItems - Remote items  
   * @param {Object} conflictAnalysis - Conflict analysis
   * @returns {Array} Merged items
   */
  static mergeItems(localItems, remoteItems, conflictAnalysis) {
    const merged = []
    const localMap = new Map(localItems.map(item => [item.partId, item]))
    const remoteMap = new Map(remoteItems.map(item => [item.partId, item]))
    const processedParts = new Set()

    // Process items that exist in both versions
    for (const [partId, localItem] of localMap) {
      if (remoteMap.has(partId)) {
        const remoteItem = remoteMap.get(partId)
        
        // Check for conflicts on this item
        const itemConflicts = conflictAnalysis.conflicts.filter(c => c.partId === partId)
        
        if (itemConflicts.length === 0) {
          // No conflicts, prefer local version (user's edit)
          merged.push(localItem)
        } else {
          // Has conflicts, need manual resolution - use remote for now
          merged.push({
            ...remoteItem,
            _hasConflict: true,
            _conflictType: itemConflicts[0].type
          })
        }
        processedParts.add(partId)
      }
    }

    // Add items that only exist in remote (added by other user)
    for (const [partId, remoteItem] of remoteMap) {
      if (!processedParts.has(partId) && !localMap.has(partId)) {
        merged.push({
          ...remoteItem,
          _addedRemotely: true
        })
      }
    }

    // Add items that only exist locally (added by user)
    for (const [partId, localItem] of localMap) {
      if (!processedParts.has(partId) && !remoteMap.has(partId)) {
        merged.push(localItem)
      }
    }

    return merged
  }

  /**
   * Check for conflicts before saving
   * @param {String} invoiceId - Invoice ID
   * @param {Number} expectedVersion - Expected version
   * @returns {Promise<Object>} Conflict check result
   */
  static async checkForConflictsBeforeSave(invoiceId, expectedVersion) {
    try {
      const docSnapshot = await getDoc(doc(db, 'invoices', invoiceId))
      
      if (!docSnapshot.exists()) {
        return {
          hasConflicts: true,
          conflicts: [{
            type: 'invoice_deleted',
            message: 'This invoice has been deleted by another user',
            severity: 'critical',
            resolutionOptions: ['cancel']
          }]
        }
      }

      const remoteInvoice = { id: docSnapshot.id, ...docSnapshot.data() }
      const remoteVersion = remoteInvoice.version || 1

      if (remoteVersion > expectedVersion) {
        return {
          hasConflicts: true,
          remoteInvoice,
          conflicts: [{
            type: 'version_conflict',
            local: expectedVersion,
            remote: remoteVersion,
            message: 'This invoice has been modified by another user',
            severity: 'critical',
            resolutionOptions: ['reload', 'merge', 'force_overwrite']
          }]
        }
      }

      return {
        hasConflicts: false,
        remoteInvoice
      }

    } catch (error) {
      console.error('Error checking for conflicts:', error)
      return {
        hasConflicts: true,
        conflicts: [{
          type: 'check_error',
          message: `Unable to verify invoice status: ${error.message}`,
          severity: 'high',
          resolutionOptions: ['retry', 'cancel']
        }]
      }
    }
  }

  /**
   * Create resolution UI data
   * @param {Object} conflictAnalysis - Conflict analysis
   * @param {Object} localInvoice - Local version
   * @param {Object} remoteInvoice - Remote version
   * @returns {Object} UI data for resolution interface
   */
  static createResolutionUIData(conflictAnalysis, localInvoice, remoteInvoice) {
    return {
      summary: {
        totalConflicts: conflictAnalysis.conflicts.length,
        totalWarnings: conflictAnalysis.warnings.length,
        severity: conflictAnalysis.severity,
        canAutoResolve: this.canAutoMerge(conflictAnalysis)
      },
      conflicts: conflictAnalysis.conflicts.map(conflict => ({
        ...conflict,
        localValue: this.formatValue(conflict.local, conflict.type),
        remoteValue: this.formatValue(conflict.remote, conflict.type),
        recommendedAction: this.getRecommendedAction(conflict)
      })),
      warnings: conflictAnalysis.warnings,
      resolutionStrategies: this.generateResolutionStrategies(conflictAnalysis, localInvoice, remoteInvoice)
    }
  }

  /**
   * Format values for display in UI
   * @param {*} value - Value to format
   * @param {String} type - Conflict type
   * @returns {String} Formatted value
   */
  static formatValue(value, type) {
    if (value === null || value === undefined) return 'Not set'
    
    switch (type) {
      case 'quantity_conflict':
        return `${value} units`
      case 'price_conflict':
        return `RM ${value.toFixed(2)}`
      case 'version_conflict':
        return `Version ${value}`
      default:
        return String(value)
    }
  }

  /**
   * Get recommended action for a specific conflict
   * @param {Object} conflict - Conflict data
   * @returns {String} Recommended action
   */
  static getRecommendedAction(conflict) {
    switch (conflict.type) {
      case 'version_conflict':
        return 'reload'
      case 'quantity_conflict':
        return 'manual' // Stock sensitive
      case 'price_conflict':
        return 'use_local' // Prefer user's pricing
      case 'customer_info_conflict':
        return 'use_local' // Prefer user's customer data
      case 'notes_conflict':
        return 'use_local' // Prefer user's notes
      default:
        return 'manual'
    }
  }
}

export default ConflictResolver
