import React, { useState, useEffect } from 'react'
import { useCustomer } from '../context/CustomerContext'
import { createQuotation, updateQuotation } from '../utils/FirebaseDataUtils'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import PDFGenerator from '../utils/PDFGenerator'
import { ResponsiveModal, ResponsiveTable, StatsGrid } from './ui'
import PartsSelector from './PartsSelector'

const fmtCurrency = (amount) =>
  new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0)
const fmtDate = (date) => (date ? new Date(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

function QuotationCreation({ setActiveSection }) {
  const [viewMode, setViewMode] = useState('list') // 'list' or 'form'
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [showViewQuotationModal, setShowViewQuotationModal] = useState(false)
  const [selectedQuotationForView, setSelectedQuotationForView] = useState(null)
  const [showPartPicker, setShowPartPicker] = useState(false)

  // Quotation form states
  const [documentMode, setDocumentMode] = useState('repair') // 'repair' | 'parts'
  const [manualParts, setManualParts] = useState([])
  const [laborCharges, setLaborCharges] = useState([])
  const [workDescription, setWorkDescription] = useState('')
  const [vehicleInfo, setVehicleInfo] = useState({ make: '', model: '', year: '', plate: '' })
  const [validityDays, setValidityDays] = useState(30)
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('Quote valid for 30 days. Prices subject to change.')

  const [quotationHistory, setQuotationHistory] = useState([])
  const [isLoadingQuotations, setIsLoadingQuotations] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isSaving, setIsSaving] = useState(false)

  const { customers = [] } = useCustomer() || {}

  // Load quotation history
  useEffect(() => {
    setIsLoadingQuotations(true)
    try {
      const quotationsQuery = query(collection(db, 'quotations'), orderBy('dateCreated', 'desc'))

      const unsubscribe = onSnapshot(quotationsQuery, (snapshot) => {
        const quotations = []
        snapshot.forEach((doc) => {
          quotations.push({
            id: doc.id,
            ...doc.data(),
            dateCreated: doc.data().dateCreated?.toDate() || new Date(),
            validUntil: doc.data().validUntil?.toDate() || new Date(),
          })
        })
        setQuotationHistory(quotations)
        setIsLoadingQuotations(false)
      })

      return () => unsubscribe()
    } catch (error) {
      console.error('Error loading quotations:', error)
      setIsLoadingQuotations(false)
    }
  }, [])

  // --- Calculations for Stats Cards ---
  const getStats = () => {
    const totalQuotes = quotationHistory.length
    const pendingQuotes = quotationHistory.filter((q) => q.status === 'pending')
    const acceptedQuotes = quotationHistory.filter((q) => q.status === 'accepted')
    const pendingValue = pendingQuotes.reduce((sum, q) => sum + (q.total || 0), 0)

    return {
      total: totalQuotes,
      pendingCount: pendingQuotes.length,
      acceptedCount: acceptedQuotes.length,
      pendingValue: pendingValue,
    }
  }
  const stats = getStats()

  // Manual parts functions
  const addManualPart = () => {
    setManualParts([...manualParts, { partId: null, sku: '', partName: '', quantity: 1, pricePerUnit: 0, total: 0 }])
  }

  // Add a part chosen from inventory (partId links it to stock; totals unchanged).
  const addInventoryPart = (part, quantity = 1) => {
    const qty = Math.max(1, Number(quantity) || 1)
    const price = Number(part.harga) || 0
    setManualParts((prev) => [
      ...prev,
      {
        partId: part.id,
        sku: part.kodProduk || '',
        partName: part.namaProduk || '',
        quantity: qty,
        pricePerUnit: price,
        total: Math.round(qty * price * 100) / 100,
      },
    ])
  }

  const updateManualPart = (index, field, value) => {
    const updated = [...manualParts]
    updated[index][field] = value

    // Auto-calculate total
    if (field === 'quantity' || field === 'pricePerUnit') {
      updated[index].total = (Number(updated[index].quantity) || 0) * (Number(updated[index].pricePerUnit) || 0)
    }

    setManualParts(updated)
  }

  const removeManualPart = (index) => {
    setManualParts(manualParts.filter((_, i) => i !== index))
  }

  // Labor charges functions
  const addLaborCharge = () => {
    setLaborCharges([...laborCharges, { sku: '', description: '', amount: 0 }])
  }

  const updateLaborCharge = (index, field, value) => {
    const updated = [...laborCharges]
    updated[index][field] = value
    setLaborCharges(updated)
  }

  const removeLaborCharge = (index) => {
    setLaborCharges(laborCharges.filter((_, i) => i !== index))
  }

  const calculateTotals = () => {
    const partsTotal = manualParts.reduce((sum, part) => sum + (part.total || 0), 0)
    const laborTotal = laborCharges.reduce((sum, labor) => sum + (labor.amount || 0), 0)
    const subtotal = partsTotal + laborTotal
    const discountAmount = (subtotal * discount) / 100
    const total = subtotal - discountAmount

    return { partsTotal, laborTotal, subtotal, discountAmount, total }
  }

  const handleCreateButtonClick = () => {
    resetForm()
    setIsEditing(false)
    setEditingId(null)
    setViewMode('form')
  }

  const handleEditButtonClick = (quotation) => {
    // Populate form with quotation data
    setEditingId(quotation.id)
    setIsEditing(true)

    // Set Customer (Construct a minimal object since we have ID/Name)
    setSelectedCustomer({
      id: quotation.customerId,
      name: quotation.customerName,
      email: quotation.customerEmail,
      phone: quotation.customerPhone,
    })

    setDocumentMode(quotation.documentMode || 'repair')
    setManualParts(quotation.partsOrdered || [])
    setLaborCharges(quotation.laborCharges || [])
    setWorkDescription(quotation.workDescription || '')
    setVehicleInfo(quotation.vehicleInfo || { make: '', model: '', year: '', plate: '' })
    setDiscount(quotation.discount || 0)
    setNotes(quotation.notes || '')
    setTerms(quotation.terms || 'Quote valid for 30 days. Prices subject to change.')

    // Calculate validity days
    const today = new Date()
    const validUntil = quotation.validUntil?.toDate ? quotation.validUntil.toDate() : new Date(quotation.validUntil)
    const diffTime = validUntil - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    setValidityDays(diffDays > 0 ? diffDays : 30)

    setViewMode('form')
  }

  const handleSaveQuotation = async () => {
    if (!selectedCustomer) {
      alert('Please select a customer')
      return
    }

    if (manualParts.length === 0 && laborCharges.length === 0) {
      alert('Please add at least one part or labor charge')
      return
    }

    setIsSaving(true)

    try {
      const totals = calculateTotals()
      const validUntilDate = new Date()
      validUntilDate.setDate(validUntilDate.getDate() + validityDays)

      // In Parts Sale mode, vehicle + work description are not applicable.
      const isParts = documentMode === 'parts'

      const quotationData = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email || '',
        customerPhone: selectedCustomer.phone || '',

        documentMode: documentMode || 'repair',

        partsOrdered: manualParts.filter((p) => p.partName),
        laborCharges: laborCharges.filter((l) => l.description),

        workDescription: isParts ? '' : workDescription,
        vehicleInfo: isParts ? { make: '', model: '', year: '', plate: '' } : vehicleInfo,
        notes,
        terms,

        partsTotal: totals.partsTotal,
        laborTotal: totals.laborTotal,
        subtotal: totals.subtotal,
        discount,
        discountAmount: totals.discountAmount,
        total: totals.total,

        validUntil: validUntilDate,
        dateCreated: isEditing ? undefined : new Date(), // Don't update creation date on edit
        status: isEditing ? undefined : 'pending', // Preserve status on edit or set pending on create
      }

      // Remove undefined values
      Object.keys(quotationData).forEach((key) => quotationData[key] === undefined && delete quotationData[key])

      if (isEditing && editingId) {
        await updateQuotation(editingId, quotationData)
        alert('Quotation updated successfully!')
      } else {
        await createQuotation(quotationData)
        alert('Quotation created successfully!')
      }

      resetForm()
      setViewMode('list')
    } catch (error) {
      console.error('Error saving quotation:', error)
      alert('Error saving quotation: ' + error.message)
    }

    setIsSaving(false)
  }

  const resetForm = () => {
    setSelectedCustomer(null)
    setDocumentMode('repair')
    setManualParts([])
    setLaborCharges([])
    setWorkDescription('')
    setVehicleInfo({ make: '', model: '', year: '', plate: '' })
    setValidityDays(30)
    setDiscount(0)
    setNotes('')
    setTerms('Quote valid for 30 days. Prices subject to change.')
    setIsEditing(false)
    setEditingId(null)
  }

  const openViewModal = (quotation) => {
    setSelectedQuotationForView(quotation)
    setShowViewQuotationModal(true)
  }

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer)
    setShowCustomerModal(false)
    setCustomerSearchTerm('')
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name?.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      customer.phone?.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(customerSearchTerm.toLowerCase())
  )

  const getFilteredQuotations = () => {
    let filtered = quotationHistory

    if (statusFilter !== 'all') {
      filtered = filtered.filter((q) => q.status === statusFilter)
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (q) =>
          q.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.quotationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.workDescription?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    return filtered
  }

  const downloadPDF = (quotation) => {
    try {
      const pdfData = {
        ...quotation,
        invoiceNumber: quotation.quotationNumber,
        isQuotation: true,
        type: 'quotation',
        documentTitle: 'QUOTATION',
        customerInfo: {
          name: quotation.customerName,
          email: quotation.customerEmail,
          phone: quotation.customerPhone,
        },
        items: [
          ...(quotation.partsOrdered || []).map((part) => ({
            kodProduk: part.sku,
            namaProduk: part.partName,
            quantity: part.quantity,
            finalPrice: part.pricePerUnit,
            totalPrice: part.total,
          })),
          ...(quotation.laborCharges || []).map((labor) => ({
            kodProduk: labor.sku || 'LABOR',
            namaProduk: labor.description,
            quantity: 1,
            finalPrice: labor.amount,
            totalPrice: labor.amount,
          })),
        ],
        totalAmount: quotation.total,
        dateCreated: quotation.dateCreated || new Date(),
        validUntil: quotation.validUntil,
        terms: quotation.terms,
        notes: quotation.notes,
        workDescription: quotation.workDescription,
      }

      PDFGenerator.downloadCustomerInvoicePDF(pdfData)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF')
    }
  }

  const totals = calculateTotals()
  const isParts = documentMode === 'parts'

  const statusPill = (status) => {
    switch (status) {
      case 'accepted':
        return 'pill-ok'
      case 'rejected':
        return 'pill-danger'
      case 'expired':
        return 'pill-muted'
      case 'pending':
        return 'pill-warn'
      default:
        return 'pill-muted'
    }
  }

  // ── List columns ──────────────────────────────────────────
  const columns = [
    {
      key: 'quotationNumber',
      header: 'Ref #',
      primary: true,
      render: (q) => (
        <div>
          <div className="font-medium text-ink">{q.quotationNumber}</div>
          <div className="text-xs text-muted">{q.customerName}</div>
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (q) =>
        q.documentMode === 'parts'
          ? <span className="pill pill-muted">Parts sale</span>
          : [q.vehicleInfo?.make, q.vehicleInfo?.model].filter(Boolean).join(' ') || '—',
    },
    { key: 'total', header: 'Amount', align: 'right', render: (q) => <span className="nums font-medium">{fmtCurrency(q.total)}</span> },
    { key: 'dateCreated', header: 'Date', align: 'right', render: (q) => fmtDate(q.dateCreated) },
    { key: 'status', header: 'Status', align: 'right', render: (q) => <span className={`pill ${statusPill(q.status)}`}>{(q.status || 'pending')}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (q) => (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openViewModal(q) }}>View</button>
          <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleEditButtonClick(q) }}>Edit</button>
          <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); downloadPDF(q) }}>PDF</button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* ── List view ─────────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          <StatsGrid
            columns={{ sm: 2, md: 4, lg: 4 }}
            stats={[
              { label: 'Total quotes', value: stats.total },
              { label: 'Pending value', value: fmtCurrency(stats.pendingValue), sublabel: `${stats.pendingCount} pending` },
              { label: 'Accepted', value: stats.acceptedCount },
              { label: 'New quotation', value: 'Create', onClick: handleCreateButtonClick },
            ]}
          />

          <div className="card">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
              <h3 className="section-title">Recent quotations</h3>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <input
                  className="input sm:w-64"
                  placeholder="Search quotations…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select className="input select sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All status</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <ResponsiveTable
              columns={columns}
              data={getFilteredQuotations()}
              keyField="id"
              loading={isLoadingQuotations}
              emptyMessage={searchQuery || statusFilter !== 'all' ? 'No quotations match your filters.' : 'No quotations yet — create your first one.'}
            />
          </div>
        </>
      )}

      {/* ── Form view (Editor) ────────────────────────────── */}
      {viewMode === 'form' && (
        <div className="max-w-4xl mx-auto space-y-4 pb-24">
          <div className="flex items-center justify-between">
            <h2 className="page-title">{isEditing ? 'Edit quotation' : 'New quotation'}</h2>
            <button onClick={() => setViewMode('list')} className="btn-ghost btn-sm">Cancel</button>
          </div>

          <p className="form-note"><span className="req-star">*</span> Required before this quotation can be saved</p>

          {/* Document mode toggle */}
          <div className="card">
            <div className="field-label">Document type</div>
            <div className="segmented">
              <button className={documentMode === 'repair' ? 'active' : ''} onClick={() => setDocumentMode('repair')}>Car Repair</button>
              <button className={documentMode === 'parts' ? 'active' : ''} onClick={() => setDocumentMode('parts')}>Parts Sale</button>
            </div>
            <p className="field-hint">
              {isParts ? 'Parts Sale hides vehicle and work-description fields.' : 'Car Repair includes vehicle details and work description.'}
            </p>
          </div>

          {/* Customer */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title req">Customer</h3>
              {selectedCustomer && (
                <button onClick={() => setSelectedCustomer(null)} className="btn-ghost btn-sm">Change</button>
              )}
            </div>
            {selectedCustomer ? (
              <div className="rounded-2xl border border-line px-4 py-3">
                <div className="font-medium text-ink">{selectedCustomer.name}</div>
                <div className="text-sm text-muted">
                  {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            ) : (
              <button onClick={() => setShowCustomerModal(true)} className="btn-secondary btn-block">Select a customer</button>
            )}
          </div>

          {selectedCustomer && (
            <>
              {/* Vehicle (repair only) */}
              {!isParts && (
                <div className="card">
                  <h3 className="section-title mb-3">Vehicle information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Make</label>
                      <input className="input" placeholder="e.g. Toyota" value={vehicleInfo.make} onChange={(e) => setVehicleInfo({ ...vehicleInfo, make: e.target.value })} />
                    </div>
                    <div>
                      <label className="field-label">Model</label>
                      <input className="input" placeholder="e.g. Vios" value={vehicleInfo.model} onChange={(e) => setVehicleInfo({ ...vehicleInfo, model: e.target.value })} />
                    </div>
                    <div>
                      <label className="field-label">Year</label>
                      <input className="input" placeholder="e.g. 2021" value={vehicleInfo.year} onChange={(e) => setVehicleInfo({ ...vehicleInfo, year: e.target.value })} />
                    </div>
                    <div>
                      <label className="field-label">License plate</label>
                      <input className="input" placeholder="e.g. ABC 1234" value={vehicleInfo.plate} onChange={(e) => setVehicleInfo({ ...vehicleInfo, plate: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="field-label">Work description / issues</label>
                    <textarea className="input textarea" placeholder="Describe the requested work or reported issues…" value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Parts & Labor */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="section-title req">Parts &amp; labor</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setShowPartPicker(true)} className="btn-secondary btn-sm">Add part</button>
                    <button onClick={addLaborCharge} className="btn-secondary btn-sm">Add labor</button>
                  </div>
                </div>

                {/* Parts list */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="subsection-title">Parts</h4>
                    <button onClick={addManualPart} className="btn-ghost btn-sm">+ Custom line</button>
                  </div>
                  {manualParts.length > 0 ? (
                    <div className="space-y-2">
                      {manualParts.map((part, index) => (
                        <div key={index} className="rounded-2xl border border-line p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs text-muted">Line {index + 1}</span>
                              {part.partId ? <span className="pill pill-accent">Inventory</span> : <span className="pill pill-muted">Custom</span>}
                            </div>
                            <button onClick={() => removeManualPart(index)} className="text-sm font-medium text-danger min-h-touch px-2">Remove</button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                            <input className="input h-11 sm:col-span-2 col-span-2" placeholder="SKU" value={part.sku} onChange={(e) => updateManualPart(index, 'sku', e.target.value)} />
                            <input className="input h-11 sm:col-span-5 col-span-2" placeholder="Item name" value={part.partName} onChange={(e) => updateManualPart(index, 'partName', e.target.value)} />
                            <input className="input h-11 sm:col-span-2 nums" type="number" placeholder="Qty" value={part.quantity} onChange={(e) => updateManualPart(index, 'quantity', parseFloat(e.target.value) || 0)} />
                            <input className="input h-11 sm:col-span-2 nums" type="number" placeholder="Price" value={part.pricePerUnit} onChange={(e) => updateManualPart(index, 'pricePerUnit', parseFloat(e.target.value) || 0)} />
                            <div className="sm:col-span-1 col-span-2 flex items-center justify-end nums font-medium text-ink">{fmtCurrency(part.total)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="card-flat text-center py-6 subtle">No parts added</div>
                  )}
                </div>

                {/* Labor list */}
                <div>
                  <h4 className="subsection-title mb-2">Labor charges</h4>
                  {laborCharges.length > 0 ? (
                    <div className="space-y-2">
                      {laborCharges.map((labor, index) => (
                        <div key={index} className="rounded-2xl border border-line p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs text-muted">Labor {index + 1}</span>
                            <button onClick={() => removeLaborCharge(index)} className="text-sm font-medium text-danger min-h-touch px-2">Remove</button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                            <input className="input h-11 sm:col-span-2 col-span-2" placeholder="Code" value={labor.sku} onChange={(e) => updateLaborCharge(index, 'sku', e.target.value)} />
                            <input className="input h-11 sm:col-span-7 col-span-2" placeholder="Description" value={labor.description} onChange={(e) => updateLaborCharge(index, 'description', e.target.value)} />
                            <input className="input h-11 sm:col-span-2 nums" type="number" placeholder="Cost" value={labor.amount} onChange={(e) => updateLaborCharge(index, 'amount', parseFloat(e.target.value) || 0)} />
                            <div className="sm:col-span-1 col-span-2 flex items-center justify-end nums font-medium text-ink">{fmtCurrency(labor.amount)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="card-flat text-center py-6 subtle">No labor charges added</div>
                  )}
                </div>
              </div>

              {/* Terms */}
              <div className="card">
                <h3 className="section-title mb-3">Terms &amp; notes</h3>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Validity period (days)</label>
                    <input type="number" className="input nums" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)} />
                  </div>
                  <div>
                    <label className="field-label">Customer notes (visible on PDF)</label>
                    <textarea className="input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Terms &amp; conditions</label>
                    <textarea className="input textarea" value={terms} onChange={(e) => setTerms(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="card">
                <h3 className="section-title mb-3">Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-muted"><span>Parts total</span><span className="nums">{fmtCurrency(totals.partsTotal)}</span></div>
                  <div className="flex justify-between text-muted"><span>Labor total</span><span className="nums">{fmtCurrency(totals.laborTotal)}</span></div>
                  <div className="flex justify-between text-ink font-medium pt-2 border-t border-line"><span>Subtotal</span><span className="nums">{fmtCurrency(totals.subtotal)}</span></div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-muted">
                      <span>Discount</span>
                      <input type="number" className="input h-9 w-20 text-center nums" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                      <span>%</span>
                    </div>
                    <span className="nums text-danger">- {fmtCurrency(totals.discountAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xl font-semibold text-ink pt-3 border-t border-line">
                    <span>Grand total</span>
                    <span className="nums">{fmtCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Sticky save bar */}
          <div className="action-bar -mx-4 sm:-mx-0 sm:rounded-2xl">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted">Grand total</div>
              <div className="text-lg font-semibold text-ink nums">{fmtCurrency(totals.total)}</div>
            </div>
            <button onClick={() => setViewMode('list')} className="btn-ghost">Cancel</button>
            <button onClick={handleSaveQuotation} disabled={isSaving || !selectedCustomer} className="btn-primary">
              {isSaving ? 'Saving…' : isEditing ? 'Update quotation' : 'Create quotation'}
            </button>
          </div>
        </div>
      )}

      {/* ── Customer selection modal ──────────────────────── */}
      <ResponsiveModal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Select customer" size="md">
        <input
          type="text"
          className="input mb-4"
          placeholder="Search name, phone, or email…"
          value={customerSearchTerm}
          onChange={(e) => setCustomerSearchTerm(e.target.value)}
        />
        <div className="max-h-[60vh] overflow-y-auto touch-scroll space-y-2">
          {filteredCustomers.map((cust) => (
            <button
              key={cust.id}
              onClick={() => selectCustomer(cust)}
              className="w-full text-left rounded-2xl border border-line px-4 py-3 hover:bg-black/[0.02] min-h-touch"
            >
              <div className="font-medium text-ink">{cust.name}</div>
              <div className="text-sm text-muted">{cust.phone}</div>
            </button>
          ))}
          {filteredCustomers.length === 0 && <p className="subtle text-center py-6">No customers found.</p>}
        </div>
      </ResponsiveModal>

      {/* ── Inventory part picker ─────────────────────────── */}
      <ResponsiveModal isOpen={showPartPicker} onClose={() => setShowPartPicker(false)} title="Add part from inventory" size="lg">
        <PartsSelector onAddPart={addInventoryPart} selectedParts={manualParts} />
        <div className="mt-4 pt-3 border-t border-line">
          <button
            onClick={() => { addManualPart(); setShowPartPicker(false) }}
            className="btn-ghost btn-block"
          >
            Add a custom (non-inventory) line instead
          </button>
        </div>
      </ResponsiveModal>

      {/* ── View modal (digital quotation preview) ────────── */}
      <ResponsiveModal
        isOpen={showViewQuotationModal && !!selectedQuotationForView}
        onClose={() => setShowViewQuotationModal(false)}
        title={selectedQuotationForView ? `Quotation ${selectedQuotationForView.quotationNumber}` : 'Quotation'}
        size="xl"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowViewQuotationModal(false)}>Close</button>
            {selectedQuotationForView && <button className="btn-primary" onClick={() => downloadPDF(selectedQuotationForView)}>Download PDF</button>}
          </>
        }
      >
        {selectedQuotationForView && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
              <div>
                <h4 className="stat-label">Quoted for</h4>
                <p className="font-medium text-ink text-lg">{selectedQuotationForView.customerName}</p>
                <p className="text-muted text-sm">{selectedQuotationForView.customerEmail}</p>
                <p className="text-muted text-sm">{selectedQuotationForView.customerPhone}</p>
              </div>
              {selectedQuotationForView.documentMode !== 'parts' && (
                <div className="sm:text-right">
                  <h4 className="stat-label">Vehicle</h4>
                  <p className="font-medium text-ink">{selectedQuotationForView.vehicleInfo?.make} {selectedQuotationForView.vehicleInfo?.model}</p>
                  <p className="text-muted text-sm">{selectedQuotationForView.vehicleInfo?.plate}</p>
                </div>
              )}
            </div>

            <div className="panel divide-y divide-line">
              <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <div className="col-span-7">Item description</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-3 text-right">Amount</div>
              </div>
              {selectedQuotationForView.partsOrdered?.map((part, i) => (
                <div key={`p-${i}`} className="grid grid-cols-12 px-4 py-3 text-sm">
                  <div className="col-span-7"><div className="font-medium text-ink">{part.partName}</div><div className="text-xs text-muted">{part.sku}</div></div>
                  <div className="col-span-2 text-center text-muted nums">{part.quantity}</div>
                  <div className="col-span-3 text-right nums font-medium text-ink">{fmtCurrency(part.total)}</div>
                </div>
              ))}
              {selectedQuotationForView.laborCharges?.map((labor, i) => (
                <div key={`l-${i}`} className="grid grid-cols-12 px-4 py-3 text-sm">
                  <div className="col-span-7"><div className="font-medium text-ink">{labor.description}</div><span className="pill pill-muted mt-1">Labor</span></div>
                  <div className="col-span-2 text-center text-muted nums">1</div>
                  <div className="col-span-3 text-right nums font-medium text-ink">{fmtCurrency(labor.amount)}</div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <div className="w-full sm:w-72 space-y-2">
                <div className="flex justify-between text-muted"><span>Subtotal</span><span className="nums">{fmtCurrency(selectedQuotationForView.subtotal)}</span></div>
                {selectedQuotationForView.discount > 0 && (
                  <div className="flex justify-between text-danger"><span>Discount ({selectedQuotationForView.discount}%)</span><span className="nums">-{fmtCurrency(selectedQuotationForView.discountAmount)}</span></div>
                )}
                <div className="flex justify-between text-xl font-semibold text-ink pt-3 border-t border-line"><span>Total</span><span className="nums">{fmtCurrency(selectedQuotationForView.total)}</span></div>
              </div>
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  )
}

export default QuotationCreation
