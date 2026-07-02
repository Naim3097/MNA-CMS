/**
 * Invoice Edit Types and Data Structures
 * Defines the shape of data for invoice editing operations
 */

// Invoice Edit Session State
export const InvoiceEditSessionState = {
  IDLE: 'idle',
  EDITING: 'editing',
  VALIDATING: 'validating',
  SAVING: 'saving',
  ERROR: 'error'
}

// Stock Change Operations
export const StockChangeType = {
  ADD_PART: 'add_part',         // New part added to invoice
  REMOVE_PART: 'remove_part',   // Part removed from invoice
  INCREASE_QTY: 'increase_qty', // Quantity increased
  DECREASE_QTY: 'decrease_qty', // Quantity decreased
  REPLACE_PART: 'replace_part'  // Part replaced with different one
}

// Validation Error Types
export const ValidationErrorType = {
  INSUFFICIENT_STOCK: 'insufficient_stock',
  PART_NOT_FOUND: 'part_not_found',
  INVALID_QUANTITY: 'invalid_quantity',
  INVALID_PRICE: 'invalid_price',
  INVOICE_NOT_FOUND: 'invoice_not_found',
  CONCURRENT_EDIT: 'concurrent_edit'
}

// Stock Change Calculation Result
export const createStockChange = (partId, type, originalQty = 0, newQty = 0, part = null) => ({
  partId,
  type,
  originalQty,
  newQty,
  netChange: calculateNetChange(type, originalQty, newQty),
  part,
  timestamp: new Date(),
  validation: {
    isValid: false,
    errors: [],
    warnings: []
  }
})

// Calculate net stock impact
const calculateNetChange = (type, originalQty, newQty) => {
  switch (type) {
    case StockChangeType.ADD_PART:
      return -newQty // Remove from stock
    case StockChangeType.REMOVE_PART:
      return originalQty // Return to stock
    case StockChangeType.INCREASE_QTY:
      return -(newQty - originalQty) // Remove additional from stock
    case StockChangeType.DECREASE_QTY:
      return originalQty - newQty // Return difference to stock
    default:
      return 0
  }
}

// Invoice Edit Session
export const createInvoiceEditSession = (originalInvoice) => ({
  id: `edit_${originalInvoice.id}_${Date.now()}`,
  originalInvoice: { ...originalInvoice }, // Immutable reference
  currentInvoice: { ...originalInvoice },  // Working copy
  state: InvoiceEditSessionState.IDLE,
  stockChanges: [],
  validationErrors: [],
  validationWarnings: [],
  isDirty: false,
  isValid: true,
  lastModified: new Date(),
  metadata: {
    editStartTime: new Date(),
    totalChanges: 0,
    userActions: []
  }
})

// Validation Result
export const createValidationResult = (isValid = true, errors = [], warnings = []) => ({
  isValid,
  errors,
  warnings,
  timestamp: new Date(),
  canProceed: isValid && errors.length === 0
})

// Audit Trail Entry
export const createAuditEntry = (invoiceId, action, changes, userId = 'system') => ({
  id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  invoiceId,
  userId,
  action,
  timestamp: new Date(),
  changes,
  metadata: {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server',
    sessionId: `session_${Date.now()}`,
    ipAddress: 'localhost' // Would be actual IP in production
  }
})

// Error with Context
export const createContextualError = (type, message, context = {}) => ({
  type,
  message,
  context,
  timestamp: new Date(),
  id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
})

export default {
  InvoiceEditSessionState,
  StockChangeType,
  ValidationErrorType,
  createStockChange,
  createInvoiceEditSession,
  createValidationResult,
  createAuditEntry,
  createContextualError
}
