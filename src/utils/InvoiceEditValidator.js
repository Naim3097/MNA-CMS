/**
 * Invoice Edit Validator
 * Comprehensive validation for invoice editing operations
 */

import { 
  ValidationErrorType, 
  createValidationResult, 
  createContextualError 
} from '../types/InvoiceTypes.js'

export class InvoiceEditValidator {
  
  /**
   * Validate that a part exists and is active
   * @param {String} partId - Part ID to validate
   * @param {Array} parts - Available parts
   * @returns {Object} Validation result
   */
  static validatePartExists(partId, parts) {
    const part = parts.find(p => p.id === partId)
    
    if (!part) {
      return createValidationResult(false, [
        createContextualError(
          ValidationErrorType.PART_NOT_FOUND,
          `Part with ID ${partId} does not exist`,
          { partId, suggestedAction: 'Remove this part or select a different one' }
        )
      ])
    }

    return createValidationResult(true)
  }

  /**
   * Validate stock availability for a specific part and quantity
   * @param {String} partId - Part ID
   * @param {Number} quantity - Required quantity
   * @param {Array} parts - Available parts
   * @returns {Object} Validation result
   */
  static validateStockAvailable(partId, quantity, parts) {
    const part = parts.find(p => p.id === partId)
    const errors = []
    const warnings = []

    if (!part) {
      errors.push(createContextualError(
        ValidationErrorType.PART_NOT_FOUND,
        `Part with ID ${partId} not found`,
        { partId }
      ))
      return createValidationResult(false, errors)
    }

    if (quantity <= 0) {
      errors.push(createContextualError(
        ValidationErrorType.INVALID_QUANTITY,
        `Quantity must be greater than 0`,
        { partId, quantity, partName: part.namaProduk }
      ))
    }

    if (quantity > part.unitStock) {
      errors.push(createContextualError(
        ValidationErrorType.INSUFFICIENT_STOCK,
        `Insufficient stock for ${part.namaProduk}. Required: ${quantity}, Available: ${part.unitStock}`,
        { 
          partId, 
          partName: part.namaProduk,
          required: quantity,
          available: part.unitStock,
          shortage: quantity - part.unitStock
        }
      ))
    } else if (part.unitStock - quantity <= 10) {
      warnings.push(createContextualError(
        'LOW_STOCK_WARNING',
        `${part.namaProduk} will have low stock (${part.unitStock - quantity}) after this change`,
        { 
          partId, 
          partName: part.namaProduk,
          remainingStock: part.unitStock - quantity
        }
      ))
    }

    return createValidationResult(errors.length === 0, errors, warnings)
  }

  /**
   * Validate pricing information for an invoice item
   * @param {Object} item - Invoice item to validate
   * @returns {Object} Validation result
   */
  static validatePricing(item) {
    const errors = []
    const warnings = []

    // Validate original price
    if (!item.originalPrice || item.originalPrice <= 0) {
      errors.push(createContextualError(
        ValidationErrorType.INVALID_PRICE,
        `Original price must be greater than 0`,
        { partId: item.partId, originalPrice: item.originalPrice }
      ))
    }

    // Validate markup
    if (item.markupType === 'percentage') {
      if (item.markupValue < 0 || item.markupValue > 1000) {
        errors.push(createContextualError(
          ValidationErrorType.INVALID_PRICE,
          `Markup percentage must be between 0% and 1000%`,
          { partId: item.partId, markupValue: item.markupValue }
        ))
      } else if (item.markupValue > 200) {
        warnings.push(createContextualError(
          'HIGH_MARKUP_WARNING',
          `High markup percentage (${item.markupValue}%) for ${item.namaProduk}`,
          { partId: item.partId, markupValue: item.markupValue }
        ))
      }
    } else if (item.markupType === 'fixed') {
      if (item.markupValue < 0) {
        errors.push(createContextualError(
          ValidationErrorType.INVALID_PRICE,
          `Fixed markup must be 0 or greater`,
          { partId: item.partId, markupValue: item.markupValue }
        ))
      } else if (item.markupValue > item.originalPrice * 2) {
        warnings.push(createContextualError(
          'HIGH_MARKUP_WARNING',
          `High fixed markup (RM ${item.markupValue}) for ${item.namaProduk}`,
          { partId: item.partId, markupValue: item.markupValue }
        ))
      }
    }

    // Validate final price calculation
    const expectedFinalPrice = item.markupType === 'percentage' 
      ? item.originalPrice * (1 + item.markupValue / 100)
      : item.originalPrice + item.markupValue

    if (Math.abs(item.finalPrice - expectedFinalPrice) > 0.01) {
      errors.push(createContextualError(
        ValidationErrorType.INVALID_PRICE,
        `Final price calculation is incorrect`,
        { 
          partId: item.partId,
          expected: expectedFinalPrice,
          actual: item.finalPrice
        }
      ))
    }

    // Validate total price
    const expectedTotalPrice = item.finalPrice * item.quantity
    if (Math.abs(item.totalPrice - expectedTotalPrice) > 0.01) {
      errors.push(createContextualError(
        ValidationErrorType.INVALID_PRICE,
        `Total price calculation is incorrect`,
        { 
          partId: item.partId,
          expected: expectedTotalPrice,
          actual: item.totalPrice
        }
      ))
    }

    return createValidationResult(errors.length === 0, errors, warnings)
  }

  /**
   * Validate complete invoice integrity
   * @param {Object} invoice - Invoice to validate
   * @param {Array} parts - Available parts
   * @returns {Object} Validation result
   */
  static validateInvoiceIntegrity(invoice, parts) {
    const errors = []
    const warnings = []

    // Basic invoice structure validation
    if (!invoice.id) {
      errors.push(createContextualError(
        'INVALID_INVOICE',
        'Invoice must have an ID',
        { invoice }
      ))
    }

    if (!invoice.invoiceNumber) {
      errors.push(createContextualError(
        'INVALID_INVOICE',
        'Invoice must have an invoice number',
        { invoiceId: invoice.id }
      ))
    }

    if (!invoice.items || !Array.isArray(invoice.items)) {
      errors.push(createContextualError(
        'INVALID_INVOICE',
        'Invoice must have items array',
        { invoiceId: invoice.id }
      ))
      return createValidationResult(false, errors)
    }

    if (invoice.items.length === 0) {
      errors.push(createContextualError(
        'INVALID_INVOICE',
        'Invoice must have at least one item',
        { invoiceId: invoice.id }
      ))
    }

    // Validate each item
    let calculatedSubtotal = 0
    invoice.items.forEach((item, index) => {
      // Validate part exists
      const partValidation = this.validatePartExists(item.partId, parts)
      if (!partValidation.isValid) {
        errors.push(...partValidation.errors)
      }

      // Validate pricing
      const pricingValidation = this.validatePricing(item)
      if (!pricingValidation.isValid) {
        errors.push(...pricingValidation.errors)
      }
      warnings.push(...pricingValidation.warnings)

      // Add to calculated subtotal
      calculatedSubtotal += item.totalPrice || 0
    })

    // Validate subtotal calculation
    if (Math.abs(invoice.subtotal - calculatedSubtotal) > 0.01) {
      errors.push(createContextualError(
        ValidationErrorType.INVALID_PRICE,
        `Invoice subtotal is incorrect. Expected: ${calculatedSubtotal}, Actual: ${invoice.subtotal}`,
        { 
          invoiceId: invoice.id,
          expected: calculatedSubtotal,
          actual: invoice.subtotal
        }
      ))
    }

    // Validate total amount (assuming no taxes/fees for now)
    if (Math.abs(invoice.totalAmount - calculatedSubtotal) > 0.01) {
      errors.push(createContextualError(
        ValidationErrorType.INVALID_PRICE,
        `Invoice total amount is incorrect. Expected: ${calculatedSubtotal}, Actual: ${invoice.totalAmount}`,
        { 
          invoiceId: invoice.id,
          expected: calculatedSubtotal,
          actual: invoice.totalAmount
        }
      ))
    }

    // Check for duplicate parts
    const partIds = invoice.items.map(item => item.partId)
    const duplicatePartIds = partIds.filter((partId, index) => partIds.indexOf(partId) !== index)
    if (duplicatePartIds.length > 0) {
      warnings.push(createContextualError(
        'DUPLICATE_PARTS',
        `Invoice contains duplicate parts: ${duplicatePartIds.join(', ')}`,
        { invoiceId: invoice.id, duplicates: duplicatePartIds }
      ))
    }

    return createValidationResult(errors.length === 0, errors, warnings)
  }

  /**
   * Validate if invoice can be edited (business rules)
   * @param {Object} invoice - Invoice to validate
   * @returns {Object} Validation result
   */
  static validateInvoiceEditable(invoice) {
    const errors = []
    const warnings = []

    // Check if invoice is too old (e.g., older than 30 days)
    const invoiceDate = new Date(invoice.dateCreated)
    const daysSinceCreated = (new Date() - invoiceDate) / (1000 * 60 * 60 * 24)
    
    if (daysSinceCreated > 30) {
      warnings.push(createContextualError(
        'OLD_INVOICE_WARNING',
        `This invoice is ${Math.floor(daysSinceCreated)} days old. Consider creating a new invoice instead.`,
        { invoiceId: invoice.id, daysSinceCreated: Math.floor(daysSinceCreated) }
      ))
    }

    // Check if invoice has been edited multiple times
    if (invoice.editCount && invoice.editCount > 5) {
      warnings.push(createContextualError(
        'MULTIPLE_EDITS_WARNING',
        `This invoice has been edited ${invoice.editCount} times. Consider reviewing for accuracy.`,
        { invoiceId: invoice.id, editCount: invoice.editCount }
      ))
    }

    return createValidationResult(true, errors, warnings)
  }

  /**
   * Real-time validation during invoice editing
   * @param {Object} editSession - Current edit session
   * @param {Array} parts - Available parts
   * @returns {Object} Validation result
   */
  static validateRealTime(editSession, parts) {
    const errors = []
    const warnings = []

    // Validate invoice integrity
    const integrityValidation = this.validateInvoiceIntegrity(editSession.currentInvoice, parts)
    errors.push(...integrityValidation.errors)
    warnings.push(...integrityValidation.warnings)

    // Validate editability
    const editableValidation = this.validateInvoiceEditable(editSession.originalInvoice)
    warnings.push(...editableValidation.warnings)

    // Check if session is stale (open for too long)
    const sessionAge = (new Date() - new Date(editSession.metadata.editStartTime)) / (1000 * 60)
    if (sessionAge > 30) { // 30 minutes
      warnings.push(createContextualError(
        'STALE_SESSION_WARNING',
        `This edit session has been open for ${Math.floor(sessionAge)} minutes. Consider refreshing the data.`,
        { sessionId: editSession.id, sessionAge: Math.floor(sessionAge) }
      ))
    }

    return createValidationResult(errors.length === 0, errors, warnings)
  }
}

export default InvoiceEditValidator
