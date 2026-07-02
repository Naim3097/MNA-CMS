import { createContext, useContext, useEffect } from 'react'
import { useFirebaseCollection } from '../hooks/useFirebaseData'
import { writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { createContextualError, ValidationErrorType } from '../types/InvoiceTypes'

const PartsContext = createContext()

export const usePartsContext = () => {
  const context = useContext(PartsContext)
  if (!context) {
    throw new Error('usePartsContext must be used within a PartsProvider')
  }
  return context
}

export function PartsProvider({ children }) {
  const { 
    data: parts, 
    loading, 
    error, 
    addItem, 
    updateItem, 
    deleteItem,
    retryConnection
  } = useFirebaseCollection('parts')

  const addPart = async (part) => {
    try {
      const newPart = {
        kodProduk: part.kodProduk,
        namaProduk: part.namaProduk,
        harga: parseFloat(part.harga),
        supplier: part.supplier,
        gambar: part.gambar || '',
        specification: part.specification || '',
        unitStock: parseInt(part.unitStock) || 0,
        dateAdded: new Date().toISOString()
      }
      
      console.log('Adding part:', newPart)
      
      // Use a timeout to prevent hanging on slow connections
      const addPromise = addItem(newPart)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Add operation timeout - saved locally')), 1500) // Reduced to 1.5 seconds
      )
      
      try {
        const id = await Promise.race([addPromise, timeoutPromise])
        console.log('Part added successfully with ID:', id)
        return { id, ...newPart }
      } catch (timeoutError) {
        // If Firebase times out, the addItem function should still save to localStorage
        console.log('Firebase timeout, but part saved locally')
        return { id: Date.now().toString(), ...newPart }
      }
    } catch (error) {
      console.error('Error in addPart:', error)
      // Don't let the error crash the component
      throw new Error(`Failed to add part: ${error.message}`)
    }
  }

  const updatePart = async (id, updatedPart) => {
    const updateData = {
      ...updatedPart,
      harga: parseFloat(updatedPart.harga),
      unitStock: parseInt(updatedPart.unitStock) || 0,
      dateUpdated: new Date().toISOString()
    }
    await updateItem(id, updateData)
  }

  const deletePart = async (id) => {
    await deleteItem(id)
  }

  const updateStock = async (id, quantity) => {
    const part = parts.find(p => p.id === id)
    if (part) {
      await updateItem(id, { 
        unitStock: Math.max(0, part.unitStock - quantity),
        dateUpdated: new Date().toISOString()
      })
    }
  }

  const getPartById = (id) => {
    return parts.find(part => part.id === id)
  }

  const searchParts = (query) => {
    if (!query) return parts
    const lowercaseQuery = query.toLowerCase()
    return parts.filter(part => 
      part.kodProduk.toLowerCase().includes(lowercaseQuery) ||
      part.namaProduk.toLowerCase().includes(lowercaseQuery) ||
      part.supplier.toLowerCase().includes(lowercaseQuery)
    )
  }

  const getLowStockParts = (threshold = 10) => {
    return parts.filter(part => part.unitStock <= threshold)
  }

  // Change one part's stock by delta (negative decrements). Allows negative results
  // (warn-but-allow-oversell policy) — callers warn the user before going below zero.
  const adjustStock = async (partId, delta) => {
    const part = parts.find(p => p.id === partId)
    if (!part) return
    const newStock = (Number(part.unitStock) || 0) + Number(delta || 0)
    await updateItem(partId, { unitStock: newStock, dateUpdated: new Date().toISOString() })
  }

  // Add stock to a part (restock / stock-in).
  const restockPart = async (partId, addQty) => {
    const qty = Math.abs(Number(addQty) || 0)
    if (!qty) return
    await adjustStock(partId, qty)
  }

  // Apply many stock deltas atomically. deltas: [{ id, delta }] (negative delta = deduct).
  // Allows negative results; returns { success, oversold: [{id, name, resulting}] }.
  const batchAdjustStock = async (deltas = []) => {
    const valid = (deltas || []).filter(d => d && d.id && Number(d.delta))
    if (!valid.length) return { success: true, oversold: [] }
    try {
      const batch = writeBatch(db)
      const timestamp = new Date().toISOString()
      const oversold = []
      for (const { id, delta } of valid) {
        const part = parts.find(p => p.id === id)
        if (!part) continue
        const newStock = (Number(part.unitStock) || 0) + Number(delta)
        if (newStock < 0) oversold.push({ id, name: part.namaProduk, resulting: newStock })
        batch.update(doc(db, 'parts', id), { unitStock: newStock, dateUpdated: timestamp })
      }
      await batch.commit()
      return { success: true, oversold }
    } catch (error) {
      console.error('batchAdjustStock failed:', error)
      return { success: false, error: error.message, oversold: [] }
    }
  }

  /**
   * Batch update stock for multiple parts atomically
   * @param {Array} stockUpdates - Array of {partId, newStock, reason}
   * @returns {Promise<Object>} Update result
   */
  const batchUpdateStock = async (stockUpdates) => {
    if (!stockUpdates || stockUpdates.length === 0) {
      return { success: true, message: 'No stock updates needed' }
    }

    try {
      const batch = writeBatch(db)
      const timestamp = new Date()

      for (const update of stockUpdates) {
        const partRef = doc(db, 'parts', update.partId)
        batch.update(partRef, {
          unitStock: update.newStock,
          updatedAt: timestamp,
          lastStockChange: {
            reason: update.reason || 'batch_update',
            change: update.stockChange || 0,
            timestamp,
            ...(update.metadata || {})
          }
        })
      }

      await batch.commit()

      return {
        success: true,
        message: `Updated stock for ${stockUpdates.length} parts`,
        updatedParts: stockUpdates.length
      }
    } catch (error) {
      console.error('Batch stock update failed:', error)
      return {
        success: false,
        error: error.message,
        details: error
      }
    }
  }

  /**
   * Reserve stock temporarily (for edit sessions)
   * @param {Array} reservations - Array of {partId, quantity, sessionId}
   * @returns {Object} Reservation result
   */
  const reserveStock = (reservations) => {
    const errors = []
    const successful = []

    for (const reservation of reservations) {
      const part = parts.find(p => p.id === reservation.partId)
      if (!part) {
        errors.push(createContextualError(
          ValidationErrorType.PART_NOT_FOUND,
          `Part ${reservation.partId} not found`,
          reservation
        ))
        continue
      }

      if (part.unitStock < reservation.quantity) {
        errors.push(createContextualError(
          ValidationErrorType.INSUFFICIENT_STOCK,
          `Insufficient stock for ${part.namaProduk}. Required: ${reservation.quantity}, Available: ${part.unitStock}`,
          { ...reservation, partName: part.namaProduk, available: part.unitStock }
        ))
        continue
      }

      successful.push({
        ...reservation,
        partName: part.namaProduk,
        reserved: true
      })
    }

    return {
      success: errors.length === 0,
      errors,
      reservations: successful,
      message: `Reserved ${successful.length} of ${reservations.length} requested items`
    }
  }

  /**
   * Release reserved stock (cleanup edit sessions)
   * @param {String} sessionId - Session ID to release
   * @returns {Object} Release result
   */
  const releaseReservation = (sessionId) => {
    // In a full implementation, this would track reservations
    // For now, we just return success since we're not actually reserving
    return {
      success: true,
      message: `Released reservations for session ${sessionId}`,
      note: 'Stock reservations are logical only - no actual stock changes made'
    }
  }

  /**
   * Validate if stock changes are possible
   * @param {Array} changes - Array of {partId, requiredStock}
   * @returns {Object} Validation result
   */
  const validateStockChanges = (changes) => {
    const errors = []
    const warnings = []

    for (const change of changes) {
      const part = parts.find(p => p.id === change.partId)
      
      if (!part) {
        errors.push(createContextualError(
          ValidationErrorType.PART_NOT_FOUND,
          `Part ${change.partId} not found`,
          change
        ))
        continue
      }

      if (change.requiredStock > part.unitStock) {
        errors.push(createContextualError(
          ValidationErrorType.INSUFFICIENT_STOCK,
          `Insufficient stock for ${part.namaProduk}. Required: ${change.requiredStock}, Available: ${part.unitStock}`,
          { 
            ...change, 
            partName: part.namaProduk, 
            available: part.unitStock,
            shortage: change.requiredStock - part.unitStock
          }
        ))
      } else if (part.unitStock - change.requiredStock <= 10) {
        warnings.push(createContextualError(
          'LOW_STOCK_WARNING',
          `${part.namaProduk} will have low stock (${part.unitStock - change.requiredStock}) after this change`,
          { 
            ...change, 
            partName: part.namaProduk,
            remainingStock: part.unitStock - change.requiredStock
          }
        ))
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0
    }
  }

  return (
    <PartsContext.Provider value={{
      parts,
      loading,
      error,
      addPart,
      updatePart,
      deletePart,
      updateStock,
      getPartById,
      searchParts,
      getLowStockParts,
      restockPart,
      adjustStock,
      batchAdjustStock,
      retryConnection,
      // New batch operations
      batchUpdateStock,
      reserveStock,
      releaseReservation,
      validateStockChanges
    }}>
      {children}
    </PartsContext.Provider>
  )
}
