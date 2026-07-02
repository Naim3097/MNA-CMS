/**
 * Simple Edit Invoice Modal - Direct approach without complex hooks
 */

import { useState, useEffect } from 'react'
import { useInvoiceContext } from '../context/InvoiceContext'
import { usePartsContext } from '../context/PartsContext'
import AtomicOperations from '../utils/AtomicOperations'

function SimpleEditInvoiceModal({ invoice, onClose, onSuccess }) {
  const { parts } = usePartsContext()
  const [selectedParts, setSelectedParts] = useState([])
  const [customerInfo, setCustomerInfo] = useState({})
  const [notes, setNotes] = useState('')
  const [totalPartsSupplierCost, setTotalPartsSupplierCost] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  
  // Initialize form data from invoice
  useEffect(() => {
    if (invoice) {
      setSelectedParts(invoice.items || [])
      setCustomerInfo(invoice.customerInfo || {
        name: 'MNA Dynamic Torque',
        contact: '+60 11-3105 1677',
        address: '15-G, JLN SG RASAU, KG SG RASAU, 42700 BANTING, SELANGOR'
      })
      setNotes(invoice.notes || '')
      // Initialize from either field to be safe
      setTotalPartsSupplierCost(invoice.partsSupplierCost || invoice.totalPartsSupplierCost || 0)
    }
  }, [invoice])

  // Calculate totals
  const calculateSubtotal = () => {
    return selectedParts.reduce((sum, item) => sum + (item.totalPrice || 0), 0)
  }

  const subtotal = calculateSubtotal()
  const total = subtotal

  // Handle part quantity update
  const handleQuantityChange = (partId, newQuantity) => {
    setSelectedParts(prev => prev.map(item => 
      item.partId === partId 
        ? { 
            ...item, 
            quantity: parseInt(newQuantity) || 1,
            totalPrice: item.finalPrice * (parseInt(newQuantity) || 1)
          }
        : item
    ))
  }

  // Handle part removal
  const handleRemovePart = (partId) => {
    setSelectedParts(prev => prev.filter(item => item.partId !== partId))
  }

  // Save changes
  const handleSave = async () => {
    if (selectedParts.length === 0) {
      alert('Please add at least one part to the invoice.')
      return
    }

    if (!window.confirm('Save changes to this invoice?\n\nThis will update stock levels accordingly.')) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      console.log('✏️ Saving invoice changes...')
      
      const updatedInvoice = {
        ...invoice,
        items: selectedParts,
        customerInfo,
        notes,
        partsSupplierCost: totalPartsSupplierCost, // Ensure this matches DB schema used in CustomerInvoiceCreation
        totalPartsSupplierCost, // Keep for backward compatibility/state hydration
        subtotal,
        totalAmount: total,
        lastModified: new Date().toISOString()
      }

      // Use atomic operation to update invoice and stock
      const result = await AtomicOperations.executeInvoiceEdit(
        invoice.id,
        updatedInvoice,
        parts,
        invoice
      )

      if (result.success) {
        console.log('✅ Invoice saved successfully')
        alert(`Invoice ${invoice.invoiceNumber} updated successfully!`)
        onSuccess?.(result.updatedInvoice)
        onClose()
      } else {
        throw new Error(result.error || 'Failed to save invoice')
      }
    } catch (err) {
      console.error('❌ Save failed:', err)
      setError(err.message)
      alert(`Error saving invoice: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (!invoice) {
    return null
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-4xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-black-25 p-4 sm:p-6 bg-primary-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-primary-black">
                Edit Invoice
              </h3>
              <div className="text-sm text-black-75 mt-1">
                {invoice.invoiceNumber} • {new Date(invoice.dateCreated).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-black-50 hover:text-primary-black text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-primary-red rounded-md p-4">
              <div className="text-primary-red font-medium">Error</div>
              <div className="text-sm text-black-75 mt-1">{error}</div>
            </div>
          )}

          {/* Internal Cost Management */}
          <div className="card bg-gray-50 border border-black-10">
             <div className="flex items-center gap-2 mb-4">
                <span className="text-lg opacity-75">🔒</span>
                <h4 className="font-semibold text-primary-black">Internal Cost Management</h4>
             </div>
             <div>
                <label className="block text-sm font-medium text-black-75 mb-2">
                   Total Parts Cost (Supplier)
                </label>
                <div className="relative rounded-md shadow-sm">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">RM</span>
                   </div>
                   <input
                      type="number"
                      step="0.01"
                      className="input-field pl-12 bg-white"
                      value={totalPartsSupplierCost || ''}
                      onChange={(e) => setTotalPartsSupplierCost(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                   />
                </div>
                <p className="mt-1 text-xs text-black-50 font-medium">
                   For job profitability tracking. Visible to admins only.
                </p>
             </div>
          </div>

          {/* Customer Info */}
          <div className="card">
            <h4 className="font-semibold text-primary-black mb-4">Customer Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-primary-black mb-2">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={customerInfo.name || ''}
                  onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-black mb-2">
                  Contact
                </label>
                <input
                  type="text"
                  value={customerInfo.contact || ''}
                  onChange={(e) => setCustomerInfo(prev => ({ ...prev, contact: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Parts List */}
          <div className="card">
            <h4 className="font-semibold text-primary-black mb-4">
              Invoice Items ({selectedParts.length})
            </h4>
            
            {selectedParts.length === 0 ? (
              <div className="text-center py-8 text-black-50">
                No parts in this invoice
              </div>
            ) : (
              <div className="space-y-3">
                {selectedParts.map((item, index) => (
                  <div key={`${item.partId}-${index}`} className="border border-black-25 rounded-md p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-primary-black">{item.namaProduk}</div>
                        <div className="text-sm text-black-75">Code: {item.kodProduk}</div>
                        <div className="text-sm text-black-75">
                          Price: RM {item.finalPrice?.toFixed(2)} × {item.quantity}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-black-75">Qty:</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleQuantityChange(item.partId, e.target.value)}
                            className="w-20 px-2 py-1 border border-black-25 rounded text-center"
                          />
                        </div>
                        
                        <div className="text-right min-w-[100px]">
                          <div className="font-semibold text-primary-black">
                            RM {item.totalPrice?.toFixed(2)}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleRemovePart(item.partId)}
                          className="text-primary-red hover:bg-red-50 p-2 rounded"
                          title="Remove"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card">
            <label className="block text-sm font-medium text-primary-black mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field h-20 resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {/* Summary */}
          <div className="card bg-black-5">
            <h4 className="font-semibold text-primary-black mb-3">Summary</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-black-75">Subtotal:</span>
                <span className="font-medium">RM {subtotal.toFixed(2)}</span>
              </div>
              <div className="border-t border-black-25 pt-2">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total:</span>
                  <span className="text-primary-black">RM {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-black-25 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="btn-secondary flex-1 min-h-[44px]"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn-primary flex-1 min-h-[44px]"
              disabled={isSaving || selectedParts.length === 0}
            >
              {isSaving ? 'Saving...' : `Save Changes (RM ${total.toFixed(2)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SimpleEditInvoiceModal
