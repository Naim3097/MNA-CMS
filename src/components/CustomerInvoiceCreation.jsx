import React, { useState, useEffect, useRef } from 'react'
import { useCustomer } from '../context/CustomerContext'
import { useMechanics } from '../context/MechanicsContext'
import { usePartsContext } from '../context/PartsContext'
import { createCustomerInvoice, updateCustomerInvoice } from '../utils/FirebaseDataUtils'
import { collection, query, orderBy, onSnapshot, getDocs, deleteDoc, doc, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { LeanxService } from '../utils/LeanxService'
import InvoicePreview from './InvoicePreview'
import PartsSelector from './PartsSelector'
import { ResponsiveModal, ResponsiveTable, StatsGrid } from './ui'

function CustomerInvoiceCreation({ setActiveSection, intent, clearIntent }) {
  // --- States ---
  const [viewMode, setViewMode] = useState('list') // 'list', 'form', 'analysis'
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Modal & Search
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showPartPicker, setShowPartPicker] = useState(false)
  const [viewInvoice, setViewInvoice] = useState(null)
  const [showPDF, setShowPDF] = useState(false)
  const [showReceipt, setShowReceipt] = useState(null)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [paymentLinkModal, setPaymentLinkModal] = useState({ show: false, url: '', invoice: null, loading: false, error: null })
  const [analysisSearch, setAnalysisSearch] = useState('')

  // Form Data
  const [documentMode, setDocumentMode] = useState('repair') // 'repair' | 'parts'
  const [manualParts, setManualParts] = useState([])
  const [originalParts, setOriginalParts] = useState([]) // snapshot of partsOrdered when editing (for stock reconciliation)
  const [laborCharges, setLaborCharges] = useState([])
  const [workDescription, setWorkDescription] = useState('')
  const [vehicleInfo, setVehicleInfo] = useState({ make: '', model: '', year: '', plate: '' })
  const [paymentTerms, setPaymentTerms] = useState(30)
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState('percentage') // 'percentage' | 'fixed'
  const [deposit, setDeposit] = useState(0)
  const [depositStatus, setDepositStatus] = useState('none') // 'none', 'paid_offline', 'link_generated', 'paid_link'
  const [notes, setNotes] = useState('')

  // Job Return / Linking
  const [parentInvoiceId, setParentInvoiceId] = useState(null)
  const [parentInvoiceNumber, setParentInvoiceNumber] = useState(null)

  // Financials & Commission
  const [useDirectLending, setUseDirectLending] = useState(false)
  const [directLendingAmount, setDirectLendingAmount] = useState(0)
  const [totalPartsSupplierCost, setTotalPartsSupplierCost] = useState(0)

  // Commission 2.0 (Flexible Multi-Person)
  const [mechanics, setMechanics] = useState([]) // [{ id, name, commissionType: 'percentage'|'fixed', commissionValue, commissionAmount }]
  const [requestDepositAmount, setRequestDepositAmount] = useState(0)

  // Collapsible optional sections (default collapsed; auto-expand when editing populated data)
  const [showDiscount, setShowDiscount] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showCommission, setShowCommission] = useState(false)
  const [showDirectLending, setShowDirectLending] = useState(false)

  // Remembers the last nav-intent nonce we handled so we react once per navigation.
  const lastHandledNonce = useRef(null)

  // Data
  const [invoiceHistory, setInvoiceHistory] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [sortField, setSortField] = useState('dateCreated') // 'dateCreated' | 'total' | 'customerName'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc' | 'desc'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'pending' | 'deposit-paid' | 'paid'

  const { customers = [] } = useCustomer() || {}
  const { activeMechanics: employees = [] } = useMechanics() || {}
  const { parts = [], getPartById, batchAdjustStock } = usePartsContext() || {}

  const isParts = documentMode === 'parts'

  // Payment Callback Handler
  useEffect(() => {
     const params = new URLSearchParams(window.location.search)
     const status = params.get('payment_status')
     const invoiceNum = params.get('invoice')
     const amountStr = params.get('amount')

     if (status === 'success' && invoiceNum && invoiceHistory.length > 0) {
        const targetInvoice = invoiceHistory.find(i => i.invoiceNumber === invoiceNum)

        if (targetInvoice) {
           const amountPaid = parseFloat(amountStr || targetInvoice.balanceDue || 0)

           // Update DB if not already paid (check balance > 1 to allow for float rounding)
           if (targetInvoice.depositStatus !== 'paid_link' && targetInvoice.balanceDue > 1) {

               const confirmUpdate = async () => {
                   try {
                      const newDeposit = (targetInvoice.deposit || 0) + amountPaid
                      const newBalance = targetInvoice.customerTotal - newDeposit

                      await updateCustomerInvoice(targetInvoice.id, {
                          depositStatus: 'paid_link',
                          deposit: newDeposit,
                          balanceDue: newBalance,
                          paymentStatus: newBalance < 1 ? 'paid' : 'deposit-paid',
                          paymentMethod: 'online_link'
                      })
                      alert(`Success! Payment of RM${amountPaid} verified and recorded.`)
                      // Open view for receipt
                      setViewInvoice(targetInvoice)
                   } catch(e) {
                       console.error(e)
                       alert("Payment verified but update failed. Check console.")
                   }
               }
               confirmUpdate()

           } else {
               // Already recorded
               if(targetInvoice.balanceDue <= 1) {
                  alert(`Payment for Invoice #${invoiceNum} verified.`)
                  setViewInvoice(targetInvoice)
               }
           }

           // Clear URL params cleanly so we don't re-trigger
           window.history.replaceState({}, document.title, window.location.pathname)
        }
     }
  }, [invoiceHistory])

  useEffect(() => {
    const q = query(collection(db, 'customer_invoices'), orderBy('dateCreated', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setInvoiceHistory(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        dateCreated: d.data().dateCreated?.toDate() || new Date()
      })))
    })
    return () => unsub()
  }, [])

  // --- Consume navigation intent (start a NEW invoice, optionally prefilled) ---
  // Fired when Home / CustomerDatabase / Quotation hands us an intent. Never deducts
  // stock — prefills only populate the form; deduction happens on real save.
  useEffect(() => {
     if (!intent || intent.view !== 'form' || intent.nonce === lastHandledNonce.current) return

     resetForm()
     setViewMode('form')
     setDocumentMode(intent.mode || 'repair')

     // Prefill customer (incl. IC / address fields the form edits)
     if (intent.customer) {
        const c = intent.customer
        setSelectedCustomer({
           id: c.id || null,
           name: c.name || '',
           phone: c.phone || '',
           email: c.email || '',
           ic: c.ic || '',
           address: c.address || ''
        })
     }

     // Prefill from a source quotation (map to CIC line/field shapes; no stock touched)
     if (intent.quote) {
        const qd = intent.quote
        setManualParts((qd.partsOrdered || []).map(p => ({
           partId: p.partId ?? null,
           sku: p.sku || '',
           partName: p.partName || '',
           quantity: Number(p.quantity) || 0,
           pricePerUnit: Number(p.pricePerUnit) || 0,
           total: Number(p.total) || Math.round((Number(p.quantity) || 0) * (Number(p.pricePerUnit) || 0) * 100) / 100
        })))
        setLaborCharges(qd.laborCharges || [])
        setVehicleInfo(qd.vehicleInfo || { make: '', model: '', year: '', plate: '' })
        setWorkDescription(qd.workDescription || '')
        if (qd.discount) {
           setDiscount(qd.discount)
           setShowDiscount(true)
        }
        if (qd.discountType) setDiscountType(qd.discountType)
     }

     lastHandledNonce.current = intent.nonce
     if (clearIntent) clearIntent()
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])

  // --- Calculations (Robust - all values forced to float) ---
  const calculateTotals = () => {
    // Recalculate each part's total from qty * price to prevent stale .total values
    const partsTotal = manualParts.reduce((s, p) => {
       const qty = parseFloat(p.quantity) || 0
       const price = parseFloat(p.pricePerUnit) || 0
       const lineTotal = Math.round(qty * price * 100) / 100 // Prevent floating point drift
       return s + lineTotal
    }, 0)
    const laborTotal = laborCharges.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    const subtotal = Math.round((partsTotal + laborTotal) * 100) / 100
    const discountAmount = discountType === 'fixed'
      ? Math.round((parseFloat(discount) || 0) * 100) / 100
      : Math.round((subtotal * (parseFloat(discount) || 0)) / 100 * 100) / 100
    const total = Math.round((subtotal - discountAmount) * 100) / 100
    const depositAmount = parseFloat(deposit) || 0
    // Deposit clamp: balance never goes negative
    const balanceDue = Math.max(0, Math.round((total - depositAmount) * 100) / 100)
    const directLending = useDirectLending ? parseFloat(directLendingAmount) || 0 : 0
    const customerPayableAmount = useDirectLending ? balanceDue - directLending : balanceDue

    // Profit Calc
    const costOfParts = Number(totalPartsSupplierCost) || 0
    const baseForCommission = subtotal

    let totalCommission = 0
    const calculatedMechanics = mechanics.map(m => {
       const amt = m.commissionType === 'percentage'
          ? (baseForCommission * (Number(m.commissionValue)||0)) / 100
          : (Number(m.commissionValue) || 0)
       totalCommission += amt
       return { ...m, commissionAmount: amt }
    })

    return {
       partsTotal, laborTotal, subtotal, discountAmount, total,
       deposit: depositAmount, balanceDue, directLendingAmount: directLending,
       customerPayableAmount, partsSupplierCost: costOfParts,
       commission: totalCommission, calculatedMechanics
    }
  }

  // Derive paymentStatus from deposit vs total (unless a manual override is chosen).
  // Manual overrides we respect: an explicit 'paid' set by the user stays 'paid'.
  const derivePaymentStatus = (total, depositAmount) => {
     if (depositAmount >= total && total > 0) return 'paid'
     if (depositAmount > 0) return 'deposit-paid'
     return 'pending'
  }

  // Record an offline payment into the accounting ledger ('transactions') so it
  // reconciles with the Accounting view. Best-effort: never blocks the main flow.
  const recordLedgerTransaction = async (invoiceId, amount) => {
     const amt = Number(amount) || 0
     if (!invoiceId || amt <= 0) return
     try {
        await addDoc(collection(db, 'transactions'), {
           invoiceId,
           transactionNumber: 'TXN-' + Date.now(),
           amount: amt,
           paymentMethod: 'offline',
           paymentDate: Timestamp.now(),
           status: 'completed'
        })
     } catch (e) {
        console.warn('Ledger sync failed:', e)
     }
  }

  // --- Actions ---
  const handleReturnJob = (invoice) => {
     resetForm()
     setSelectedCustomer({
        id: invoice.customerId,
        name: invoice.customerName,
        phone: invoice.customerPhone,
        email: invoice.customerEmail,
        ic: invoice.customerIC || '',
        address: invoice.customerAddress || ''
     })
     setParentInvoiceId(invoice.id)
     setParentInvoiceNumber(invoice.invoiceNumber)
     setDocumentMode(invoice.documentMode || 'repair')
     setVehicleInfo(invoice.vehicleInfo || { make: '', model: '', year: '', plate: '' })
     setWorkDescription(`Return Job / Warranty Claim for Invoice #${invoice.invoiceNumber}`)
     setViewMode('form')
  }

  const startEditInvoice = (i) => {
     setIsEditing(true)
     setEditingId(i.id)
     setSelectedCustomer({ id: i.customerId, name: i.customerName, phone: i.customerPhone, email: i.customerEmail, ic: i.customerIC || '', address: i.customerAddress || '' })
     setDocumentMode(i.documentMode || 'repair')
     setManualParts(i.partsOrdered || [])
     setOriginalParts(i.partsOrdered || []) // snapshot for stock reconciliation
     setLaborCharges(i.laborCharges || [])
     setPaymentStatus(i.paymentStatus)
     setMechanics(i.mechanics || [])
     setDeposit(i.deposit || 0)
     setTotalPartsSupplierCost(i.partsSupplierCost || 0)
     setDiscount(i.discount || 0)
     setDiscountType(i.discountType || 'percentage')
     setWorkDescription(i.workDescription || '')
     setVehicleInfo(i.vehicleInfo || { make: '', model: '', year: '', plate: '' })
     setNotes(i.notes || '')
     setUseDirectLending(!!i.useDirectLending)
     setDirectLendingAmount(i.directLendingAmount || 0)
     setRequestDepositAmount(0)
     setParentInvoiceId(i.parentInvoiceId || null)
     setParentInvoiceNumber(i.parentInvoiceNumber || null)
     // Auto-expand any optional section that already carries a value.
     setShowDiscount(Number(i.discount) > 0)
     setShowDeposit(Number(i.deposit) > 0)
     setShowCommission((i.mechanics || []).length > 0 || Number(i.partsSupplierCost) > 0)
     setShowDirectLending(!!i.useDirectLending)
     setViewMode('form')
  }

  // Add a part chosen from inventory. Links via partId; totals math unchanged.
  const addInventoryPart = (part, quantity = 1) => {
     const qty = Math.max(1, Number(quantity) || 1)
     const price = Number(part.harga) || 0
     setManualParts(prev => [
        ...prev,
        {
           partId: part.id,
           sku: part.kodProduk || '',
           partName: part.namaProduk || '',
           quantity: qty,
           pricePerUnit: price,
           total: Math.round(qty * price * 100) / 100
        }
     ])
  }

  const addCustomPart = () => {
     setManualParts([...manualParts, { partId: null, sku: '', partName: '', quantity: 1, pricePerUnit: 0, total: 0 }])
  }

  // Warn-but-allow negative stock. Returns true if OK to proceed, false to abort.
  // deltas: [{ id, delta }] with negative delta = deduct.
  const confirmStockDeltas = (deltas) => {
     const shortfalls = []
     for (const { id, delta } of deltas) {
        if (!id || !delta) continue
        const part = (getPartById && getPartById(id)) || parts.find(p => p.id === id)
        if (!part) continue
        const current = Number(part.unitStock) || 0
        const resulting = current + Number(delta)
        if (resulting < 0) {
           const need = Math.abs(delta)
           shortfalls.push(`${part.namaProduk}: only ${current} in stock, this needs ${need} → ${resulting}`)
        }
     }
     if (shortfalls.length === 0) return true
     return window.confirm(
        'Some parts will go below zero stock:\n\n' + shortfalls.join('\n') + '\n\nContinue anyway?'
     )
  }

  const handleSaveInvoice = async () => {
    // Guard is enforced by the disabled Save button + inline reason (see canSave).
    // Kept as a silent safety net so the save logic below is unchanged.
    if (!selectedCustomer) return
    if (manualParts.length === 0 && laborCharges.length === 0) return

    // Helper to recursively remove undefined (Firebase safety)
    const sanitize = (obj) => {
        if (obj === undefined) return null;
        if (obj === null) return null;
        if (typeof obj !== 'object') return obj;
        if (obj instanceof Date) return obj;
        if (Array.isArray(obj)) return obj.map(sanitize);
        const newObj = {};
        Object.keys(obj).forEach(key => {
            const val = sanitize(obj[key]);
            if (val !== undefined) newObj[key] = val;
            else newObj[key] = null;
        });
        return newObj;
    };

    const t = calculateTotals()

    // --- Stock reconciliation deltas (CIC only; quotations never touch stock) ---
    // CREATE: deduct new parts (delta = -qty).
    // EDIT: net delta per partId = (originalQty - newQty) applied as change to stock.
    let stockDeltas = []
    if (isEditing) {
       const map = {}
       for (const p of (originalParts || [])) {
          if (!p.partId) continue
          map[p.partId] = (map[p.partId] || 0) + (Number(p.quantity) || 0) // stock that was previously deducted
       }
       for (const p of (manualParts || [])) {
          if (!p.partId) continue
          map[p.partId] = (map[p.partId] || 0) - (Number(p.quantity) || 0)
       }
       // map now holds (originalQty - newQty): positive = restore, negative = deduct further
       stockDeltas = Object.entries(map).map(([id, delta]) => ({ id, delta })).filter(d => d.delta !== 0)
    } else {
       const map = {}
       for (const p of (manualParts || [])) {
          if (!p.partId) continue
          map[p.partId] = (map[p.partId] || 0) - (Number(p.quantity) || 0)
       }
       stockDeltas = Object.entries(map).map(([id, delta]) => ({ id, delta })).filter(d => d.delta !== 0)
    }

    // Warn-but-allow negative before we write anything.
    if (stockDeltas.length && batchAdjustStock) {
       if (!confirmStockDeltas(stockDeltas)) return // user cancelled
    }

    setIsSaving(true)
    try {
       // Recompute paymentStatus from deposit vs total (respect explicit manual 'paid').
       const depositAmount = Number(t.deposit) || 0
       const computedStatus = paymentStatus === 'paid' && depositAmount >= t.total
          ? 'paid'
          : derivePaymentStatus(t.total, depositAmount)

       const rawData = {
          customerId: selectedCustomer.id || null,
          customerName: selectedCustomer.name || 'Unknown',
          customerPhone: selectedCustomer.phone || '',
          customerEmail: selectedCustomer.email || '',
          customerIC: selectedCustomer.ic || '',
          customerAddress: selectedCustomer.address || '',
          documentMode: documentMode || 'repair',
          workDescription: isParts ? '' : (workDescription || ''),
          vehicleInfo: isParts ? { make: '', model: '', year: '', plate: '' } : (vehicleInfo || { make: '', model: '', year: '', plate: '' }),
          partsOrdered: manualParts || [],
          laborCharges: laborCharges || [],
          // money
          partsTotal: Number(t.partsTotal) || 0,
          laborTotal: Number(t.laborTotal) || 0,
          subtotal: Number(t.subtotal) || 0,
          discount: Number(discount) || 0,
          discountType: discountType || 'percentage',
          discountAmount: Number(t.discountAmount) || 0,
          deposit: Number(t.deposit) || 0,
          depositStatus: t.deposit > 0 ? 'paid_offline' : (requestDepositAmount > 0 ? 'link_generated' : 'none'),
          balanceDue: Number(t.balanceDue) || 0,
          total: Number(t.total) || 0,
          customerTotal: Number(t.total) || 0,
          customerPayableAmount: Number(t.customerPayableAmount) || 0,
          useDirectLending: !!useDirectLending,
          directLendingAmount: Number(t.directLendingAmount) || 0,
          paymentStatus: computedStatus,
          paymentTerms: Number(paymentTerms) || 0,
          notes: notes || '',
          // internal (mechanics/commission cleared in parts mode)
          partsSupplierCost: Number(t.partsSupplierCost) || 0,
          mechanics: isParts ? [] : (t.calculatedMechanics || []),
          commissionAmount: isParts ? 0 : (Number(t.commission) || 0),
          // linking
          parentInvoiceId: parentInvoiceId || null,
          parentInvoiceNumber: parentInvoiceNumber || null,
          invoiceType: parentInvoiceId ? 'return_job' : 'standard'
       }

       const data = sanitize(rawData); // Clean up any lingering undefined values

       if (isEditing && editingId) {
          await updateCustomerInvoice(editingId, data)
          // Reconcile stock (net deltas) after successful save.
          if (stockDeltas.length && batchAdjustStock) await batchAdjustStock(stockDeltas)
          // Ledger sync if a deposit was recorded offline on this edit.
          alert('Updated!')
       } else {
          data.dateCreated = new Date()
          data.dueDate = new Date(Date.now() + paymentTerms * 86400000)
          const res = await createCustomerInvoice(data)
          // Deduct stock after invoice is created.
          if (stockDeltas.length && batchAdjustStock) await batchAdjustStock(stockDeltas)
          // Ledger sync: if a deposit was collected offline at creation, mirror it to the ledger.
          if (Number(t.deposit) > 0) await recordLedgerTransaction(res.id, Number(t.deposit))
          alert('Created!')
          if (requestDepositAmount > 0) {
              setPaymentLinkModal({ show: true, amount: requestDepositAmount, invoice: { ...data, id: res.id, invoiceNumber: res.invoiceNumber || 'NEW' } })
          }
       }
       resetForm()
       setViewMode('list')
    } catch (e) {
       console.error(e)
       alert('Error: ' + e.message)
    } finally {
       setIsSaving(false)
    }
  }

  const resetForm = () => {
     setSelectedCustomer(null)
     setDocumentMode('repair')
     setManualParts([])
     setOriginalParts([])
     setLaborCharges([])
     setWorkDescription('')
     setVehicleInfo({ make: '', model: '', year: '', plate: '' })
     setPaymentStatus('pending')
     setDiscount(0)
     setDiscountType('percentage')
     setDeposit(0)
     setDepositStatus('none')
     setIsEditing(false)
     setEditingId(null)
     setTotalPartsSupplierCost(0)
     setMechanics([])
     setNotes('')
     setParentInvoiceId(null)
     setParentInvoiceNumber(null)
     setRequestDepositAmount(0)
     // Optional sections start collapsed on a fresh form.
     setShowDiscount(false)
     setShowDeposit(false)
     setShowCommission(false)
     setShowDirectLending(false)
  }

  const handleDelete = async (invoice) => {
     const id = typeof invoice === 'string' ? invoice : invoice?.id
     const inv = typeof invoice === 'string' ? invoiceHistory.find(x => x.id === invoice) : invoice
     if (!id) return
     if (!window.confirm('Delete this invoice? Stock for any linked parts will be restored.')) return
     // Restore stock for any inventory-linked parts before/after deletion.
     const restoreDeltas = []
     const map = {}
     for (const p of (inv?.partsOrdered || [])) {
        if (!p.partId) continue
        map[p.partId] = (map[p.partId] || 0) + (Number(p.quantity) || 0)
     }
     for (const [pid, delta] of Object.entries(map)) restoreDeltas.push({ id: pid, delta })
     await deleteDoc(doc(db, 'customer_invoices', id))
     if (restoreDeltas.length && batchAdjustStock) await batchAdjustStock(restoreDeltas)
  }

  // --- Payment Link ---
  const handleLink = (inv) => {
     if (inv.paymentStatus === 'paid' && inv.balanceDue <= 0) {
         alert("This invoice is already fully paid.")
         return
     }

     // EXTENSIVE ANALYSIS: Current Balance vs Saved Link
     // 1. Calculate what we NEED to charge now (Current Balance)
     const currentBalance = inv.balanceDue > 0 ? inv.balanceDue : (inv.total || inv.customerTotal)

     // 2. Check if we have an existing link
     let existingUrl = inv.lastPaymentLink
     let showUrl = null

     // 3. Auto-Detection Logic
     if (existingUrl) {
         // Scenario A: Deposit Phase
         if (inv.depositStatus === 'link_generated' || inv.depositStatus === 'pending') {
             showUrl = existingUrl
         }
         // Scenario B: Full Payment Phase (No Deposit)
         else if ((!inv.deposit || inv.deposit === 0) && inv.paymentStatus !== 'paid') {
             showUrl = existingUrl
         }
         // Scenario C: Balance Phase (Deposit Paid, Balance Remains)
         else if ((inv.depositStatus === 'paid_link' || inv.depositStatus === 'paid_offline') && inv.balanceDue > 1) {
             showUrl = null // Force "Generate New Link" view
         }
         // Scenario D: Fallback
         else {
             showUrl = existingUrl
         }
     }

     setPaymentLinkModal({
         show: true,
         amount: currentBalance,
         invoice: inv,
         url: showUrl,
         isBalanceLink: inv.depositStatus?.includes('paid')
     })
  }

  const generateLink = async () => {
     const { invoice, amount } = paymentLinkModal
     try {
       setPaymentLinkModal(p => ({...p, loading: true, error: null}))
       // Try real service
       const res = await LeanxService.generatePaymentLink(invoice, { name: invoice.customerName, phone: invoice.customerPhone }, amount)
       if (res.success) {
          setPaymentLinkModal(p => ({...p, url: res.url, loading: false}))

          // Save the generated link to Firestore so it can be used for "Retry Payment" later
          try {
             await updateCustomerInvoice(invoice.id, {
                 lastPaymentLink: res.url,
                 lastPaymentId: res.id || null // Save the Bill ID for API verification
             })
          } catch(err) { console.warn("Could not save payment link to DB", err) }
       } else {
          throw new Error(res.error || 'Failed')
       }
     } catch (e) {
        // Validation / Demo Fallback
        const demo = `https://demo.payment.com/pay/${invoice.invoiceNumber}?amt=${amount}`
        setPaymentLinkModal(p => ({...p, url: demo, loading: false, error: 'Demo Link Generated (API Failed)'}))
     }
  }

  const confirmDepositPaid = async (invoice) => {
     const addAmount = requestDepositAmount > 0 ? Number(requestDepositAmount) : 0
     if(window.confirm(`Confirm deposit of RM${requestDepositAmount > 0 ? requestDepositAmount : invoice.deposit} received via link?`)) {
        const newDeposit = (invoice.deposit || 0) + addAmount
        const total = invoice.customerTotal || invoice.total || 0
        const newBalance = Math.max(0, total - newDeposit)
        await updateCustomerInvoice(invoice.id, {
            depositStatus: 'paid_link',
            deposit: newDeposit,
            balanceDue: newBalance,
            paymentStatus: newBalance < 1 ? 'paid' : 'deposit-paid'
        })
        // Ledger sync: mirror this offline-confirmed payment into 'transactions'.
        if (addAmount > 0) await recordLedgerTransaction(invoice.id, addAmount)
     }
  }

  // Mark a link-sent deposit as paid (list action). Also syncs the ledger.
  const markDepositPaid = async (invoice, amount) => {
     const amt = Number(amount) || 0
     if (amt <= 0 || isNaN(amt)) return
     const total = invoice.customerTotal || invoice.total || 0
     const newBalance = Math.max(0, total - amt)
     await updateCustomerInvoice(invoice.id, {
        depositStatus: 'paid_link',
        deposit: amt,
        balanceDue: newBalance,
        paymentStatus: newBalance < 1 ? 'paid' : 'deposit-paid'
     })
     await recordLedgerTransaction(invoice.id, amt)
  }

  // --- Analysis Helpers ---
  const getAnalysis = () => {
     let rev = 0, cost = 0, profit = 0
     const items = invoiceHistory.map(i => {
        const r = Number(i.customerTotal || i.total || 0)
        const c = (Number(i.partsSupplierCost)||0) + (Number(i.commissionAmount)||0)
        const p = r - c
        rev += r; cost += c; profit += p
        return { ...i, calculatedProfit: p, calculatedCost: c }
     })
     return { rev, cost, profit, margin: rev ? (profit/rev)*100 : 0, items }
  }
  const analysis = getAnalysis()
  const totals = calculateTotals()

  // Save gate: need a customer and at least one line item. Drives the disabled
  // state + inline reason on the Save button (replaces the old save-time alerts).
  const canSave = !!selectedCustomer && (manualParts.length > 0 || laborCharges.length > 0)
  const saveReason = !selectedCustomer
     ? 'Add a customer and at least one item to save'
     : (manualParts.length === 0 && laborCharges.length === 0)
        ? 'Add at least one part or labour item to save'
        : ''

  // Show the friendly empty state only with a truly empty list (no search/filter active).
  const isListEmpty = invoiceHistory.length === 0 && !searchQuery && statusFilter === 'all'
  const startNewInvoice = () => { resetForm(); setViewMode('form') }

  // --- Render Helpers ---
  const formatCurrency = (v) => new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(v || 0)
  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

  // Mechanic Mgmt
  const addMechanic = (e) => {
     const emp = employees.find(em => em.id === e.target.value)
     if(emp && !mechanics.find(m => m.id === emp.id)) {
        const empName = emp.name || (emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : 'Unnamed Staff')
        setMechanics([...mechanics, { id: emp.id, name: empName, commissionType: 'percentage', commissionValue: 0 }])
     }
  }

  const paymentPill = (i) => {
     if (i.paymentStatus === 'paid') return { cls: 'pill-ok', label: 'Paid' }
     if (i.paymentStatus === 'deposit-paid' || i.deposit > 0) return { cls: 'pill-warn', label: 'Deposit paid' }
     return { cls: 'pill-muted', label: 'Pending' }
  }

  // --- Filtering / sorting for the list ---
  const visibleInvoices = invoiceHistory
     .filter(i => !searchQuery || i.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) || i.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()))
     .filter(i => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'pending') return i.paymentStatus !== 'paid' && i.paymentStatus !== 'deposit-paid'
        return i.paymentStatus === statusFilter
     })
     .sort((a, b) => {
        let valA, valB
        if (sortField === 'dateCreated') { valA = new Date(a.dateCreated); valB = new Date(b.dateCreated) }
        else if (sortField === 'total') { valA = Number(a.total || a.customerTotal || 0); valB = Number(b.total || b.customerTotal || 0) }
        else if (sortField === 'customerName') { valA = (a.customerName || '').toLowerCase(); valB = (b.customerName || '').toLowerCase() }
        else if (sortField === 'balanceDue') { valA = Number(a.balanceDue || 0); valB = Number(b.balanceDue || 0) }
        else { valA = a[sortField]; valB = b[sortField] }
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1
        return 0
     })

  const listColumns = [
     {
        key: 'invoiceNumber', header: 'Invoice', primary: true,
        render: (i) => (
           <div>
              <div className="flex items-center gap-2 flex-wrap">
                 <span className="font-medium text-ink">{i.invoiceNumber}</span>
                 {i.useDirectLending && <span className="pill pill-accent">BNPL</span>}
                 {i.documentMode === 'parts' && <span className="pill pill-muted">Parts</span>}
              </div>
              <div className="text-xs text-muted">{i.customerName}{i.parentInvoiceNumber ? ` · Ret #${i.parentInvoiceNumber}` : ''}</div>
           </div>
        )
     },
     { key: 'dateCreated', header: 'Date', render: (i) => formatDate(i.dateCreated) },
     {
        key: 'mechanic', header: 'Mechanic',
        render: (i) => (i.mechanics || []).map(m => (m.name || '').split(' ')[0]).join(', ') || '—'
     },
     { key: 'total', header: 'Amount', align: 'right', render: (i) => <span className="nums font-medium">{formatCurrency(i.total || i.customerTotal)}</span> },
     {
        key: 'deposit', header: 'Deposit', align: 'right',
        render: (i) => {
           if (i.deposit > 0) {
              return (
                 <div className="flex flex-col items-end gap-1">
                    <span className="nums text-ok">{formatCurrency(i.deposit)}</span>
                    {i.balanceDue > 1 && (
                       <button className="text-xs font-medium text-accent whitespace-nowrap hover:underline" onClick={(e) => { e.stopPropagation(); setPaymentLinkModal({ show: true, amount: i.balanceDue, invoice: i }) }}>Send link</button>
                    )}
                 </div>
              )
           }
           if (i.depositStatus === 'link_generated') {
              return (
                 <button
                    className="pill pill-warn"
                    onClick={(e) => {
                       e.stopPropagation()
                       const amt = prompt('Enter deposit amount received (RM):', ((i.total || i.customerTotal || 0) * 0.1).toFixed(2))
                       if (amt && !isNaN(amt)) markDepositPaid(i, Number(amt))
                    }}
                    title="Click to mark as paid"
                 >
                    Link sent — mark paid
                 </button>
              )
           }
           return <span className="text-faint">—</span>
        }
     },
     {
        key: 'status', header: 'Status', align: 'right',
        render: (i) => { const p = paymentPill(i); return <span className={`pill ${p.cls}`}>{p.label}</span> }
     },
     {
        key: 'actions', header: '', align: 'right',
        render: (i) => (
           <div className="flex justify-end gap-1.5 flex-wrap">
              <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setViewInvoice(i) }}>View</button>
              <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); startEditInvoice(i) }}>Edit</button>
              <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleLink(i) }}>Link</button>
              {i.paymentStatus === 'paid' && <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setShowReceipt(i) }}>Receipt</button>}
              <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleReturnJob(i) }}>Return</button>
              <button className="btn-ghost btn-sm text-danger" onClick={(e) => { e.stopPropagation(); handleDelete(i) }}>Delete</button>
           </div>
        )
     }
  ]

  return (
    <div className="space-y-5">

       {/* ── List: stats ─────────────────────────────────── */}
       {viewMode === 'list' && (
          <StatsGrid
             columns={{ sm: 2, md: 4, lg: 4 }}
             stats={[
                { label: 'Total invoices', value: invoiceHistory.length },
                { label: 'Total revenue', value: formatCurrency(analysis.rev) },
                { label: 'Total profit', value: formatCurrency(analysis.profit), sublabel: `Margin ${analysis.margin.toFixed(1)}%` },
                { label: 'New invoice', value: 'Create', onClick: startNewInvoice },
             ]}
          />
       )}

       {/* ── List view: empty state ──────────────────────── */}
       {viewMode === 'list' && isListEmpty && (
          <div className="card">
             <div className="card-flat text-center py-12 px-4">
                <h3 className="section-title mb-1">No invoices yet</h3>
                <p className="subtle mb-4">Create your first invoice to bill a repair job or a parts sale.</p>
                <button className="btn-primary" onClick={startNewInvoice}>New invoice</button>
             </div>
          </div>
       )}

       {/* ── List view ───────────────────────────────────── */}
       {viewMode === 'list' && !isListEmpty && (
          <div className="card">
             <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
                <h3 className="section-title">Billing</h3>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                   <input className="input sm:w-64" placeholder="Search invoice or customer…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                   <button className="btn-secondary" onClick={() => setViewMode('analysis')}>Analysis</button>
                </div>
             </div>

             {/* Filters + sort */}
             <div className="flex flex-wrap gap-2 items-center mb-4">
                <div className="segmented">
                   {[{key:'all',label:'All'},{key:'pending',label:'Unpaid'},{key:'deposit-paid',label:'Deposit'},{key:'paid',label:'Paid'}].map(f => (
                      <button key={f.key} className={statusFilter === f.key ? 'active' : ''} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
                   ))}
                </div>
                <select className="input select h-10 sm:w-44" value={sortField} onChange={e => setSortField(e.target.value)}>
                   <option value="dateCreated">Sort: Date</option>
                   <option value="total">Sort: Amount</option>
                   <option value="customerName">Sort: Customer</option>
                   <option value="balanceDue">Sort: Balance</option>
                </select>
                <button className="btn-secondary btn-sm" onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}>
                   {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                </button>
             </div>

             <ResponsiveTable
                columns={listColumns}
                data={visibleInvoices}
                keyField="id"
                emptyMessage={searchQuery || statusFilter !== 'all' ? 'No invoices match your filters.' : 'No invoices yet — create your first one.'}
             />
          </div>
       )}

       {/* ── Form view (Editor) ──────────────────────────── */}
       {viewMode === 'form' && (
          <div className="max-w-4xl mx-auto space-y-4 pb-24">
             <div className="flex items-center justify-between">
                <div>
                   <h2 className="page-title">{isEditing ? 'Edit invoice' : parentInvoiceId ? 'New return job' : 'New invoice'}</h2>
                   {parentInvoiceId && <p className="text-sm text-accent font-medium">Linked to invoice #{parentInvoiceNumber}</p>}
                </div>
                <button onClick={() => setViewMode('list')} className="btn-ghost btn-sm">Cancel</button>
             </div>

             <p className="form-note"><span className="req-star">*</span> Required before this invoice can be saved</p>

             {/* Step 1 — Customer (gates the rest of the form) */}
             <div className="card">
                <div className="flex items-center justify-between mb-3">
                   <h3 className="section-title req">1&nbsp;&nbsp;Customer</h3>
                   {selectedCustomer && <button onClick={() => setSelectedCustomer(null)} className="btn-ghost btn-sm">Change</button>}
                </div>
                {selectedCustomer ? (
                   <div className="space-y-3">
                      <div className="rounded-2xl border border-line px-4 py-3">
                         <div className="font-medium text-ink">{selectedCustomer.name}</div>
                         <div className="text-sm text-muted">{selectedCustomer.phone || '—'}</div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         <div>
                            <label className="field-label">IC number (optional)</label>
                            <input className="input" placeholder="e.g. 900101-14-5678" value={selectedCustomer.ic || ''} onChange={e => setSelectedCustomer({ ...selectedCustomer, ic: e.target.value })} />
                         </div>
                         <div>
                            <label className="field-label">Address (optional)</label>
                            <input className="input" placeholder="Customer address" value={selectedCustomer.address || ''} onChange={e => setSelectedCustomer({ ...selectedCustomer, address: e.target.value })} />
                         </div>
                      </div>
                   </div>
                ) : (
                   <button onClick={() => setShowCustomerModal(true)} className="btn-secondary btn-block">Select a customer</button>
                )}
             </div>

             {/* Steps 2–4 unlock once a customer is chosen */}
             <div className={selectedCustomer ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none select-none'} aria-disabled={!selectedCustomer}>
                {!selectedCustomer && <p className="subtle">Select a customer to continue.</p>}

             {/* Step 2 — Document type */}
             <div className="card">
                <div className="field-label">2&nbsp;&nbsp;Document type</div>
                <div className="segmented">
                   <button className={documentMode === 'repair' ? 'active' : ''} onClick={() => setDocumentMode('repair')}>Car Repair</button>
                   <button className={documentMode === 'parts' ? 'active' : ''} onClick={() => setDocumentMode('parts')}>Parts Sale</button>
                </div>
                <p className="field-hint">
                   {isParts ? 'Parts Sale hides vehicle, work description, and mechanic commission.' : 'Car Repair includes vehicle, work description, and commission.'}
                </p>
             </div>

             {/* Vehicle + work (repair only) */}
             {!isParts && (
                <div className="card">
                   <h3 className="section-title mb-3">Vehicle information <span className="text-muted font-normal">(optional)</span></h3>
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                         <label className="field-label">Make / Model</label>
                         <input className="input" placeholder="e.g. Honda Civic" value={`${vehicleInfo.make || ''}${vehicleInfo.make && vehicleInfo.model ? ' ' : ''}${vehicleInfo.model || ''}`} onChange={e => {
                            const val = e.target.value
                            const p = val.split(' ')
                            setVehicleInfo({ ...vehicleInfo, make: p[0] || '', model: p.slice(1).join(' ') || '' })
                         }} />
                      </div>
                      <div>
                         <label className="field-label">Plate no</label>
                         <input className="input" placeholder="e.g. WA 1234 B" value={vehicleInfo.plate || ''} onChange={e => setVehicleInfo({ ...vehicleInfo, plate: e.target.value })} />
                      </div>
                      <div>
                         <label className="field-label">Work description</label>
                         <input className="input" placeholder="Work description" value={workDescription} onChange={e => setWorkDescription(e.target.value)} />
                      </div>
                   </div>
                </div>
             )}

             {/* Step 3 — Parts & labour */}
             <div className="card">
                <div className="flex items-center justify-between mb-3">
                   <h3 className="section-title req">3&nbsp;&nbsp;Parts &amp; labour</h3>
                   <div className="flex gap-2">
                      <button onClick={() => setShowPartPicker(true)} className="btn-secondary btn-sm">Add part</button>
                      <button onClick={() => setLaborCharges([...laborCharges, { description: '', amount: 0 }])} className="btn-secondary btn-sm">Add labor</button>
                   </div>
                </div>

                <div className="mb-4">
                   <div className="flex items-center justify-between mb-2">
                      <h4 className="subsection-title">Parts</h4>
                      <button onClick={addCustomPart} className="btn-ghost btn-sm">+ Custom line</button>
                   </div>
                   {manualParts.length ? (
                      <div className="space-y-2">
                         {manualParts.map((p, i) => (
                            <div key={i} className="rounded-2xl border border-line p-3">
                               <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                     <span className="text-xs text-muted">Line {i + 1}</span>
                                     {p.partId ? <span className="pill pill-accent">Inventory</span> : <span className="pill pill-muted">Custom</span>}
                                  </div>
                                  <button onClick={() => setManualParts(manualParts.filter((_, x) => x !== i))} className="text-sm font-medium text-danger min-h-touch px-2">Remove</button>
                               </div>
                               <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                                  <input className="input h-11 sm:col-span-2 col-span-2" placeholder="SKU" value={p.sku} onChange={e => { const u = [...manualParts]; u[i].sku = e.target.value; setManualParts(u) }} />
                                  <input className="input h-11 sm:col-span-5 col-span-2" placeholder="Part name" value={p.partName} onChange={e => { const u = [...manualParts]; u[i].partName = e.target.value; setManualParts(u) }} />
                                  <input className="input h-11 sm:col-span-2 nums" type="number" placeholder="Qty" value={p.quantity} onChange={e => { const u = [...manualParts]; u[i].quantity = parseFloat(e.target.value) || 0; u[i].total = Math.round(u[i].quantity * u[i].pricePerUnit * 100) / 100; setManualParts(u) }} />
                                  <input className="input h-11 sm:col-span-2 nums" type="number" placeholder="Price" value={p.pricePerUnit} onChange={e => { const u = [...manualParts]; u[i].pricePerUnit = parseFloat(e.target.value) || 0; u[i].total = Math.round(u[i].quantity * u[i].pricePerUnit * 100) / 100; setManualParts(u) }} />
                                  <div className="sm:col-span-1 col-span-2 flex items-center justify-end nums font-medium text-ink">{formatCurrency(p.total)}</div>
                               </div>
                            </div>
                         ))}
                      </div>
                   ) : (
                      <div className="card-flat text-center py-6 subtle">No parts added</div>
                   )}
                </div>

                <div>
                   <h4 className="subsection-title mb-2">Labor charges</h4>
                   {laborCharges.length ? (
                      <div className="space-y-2">
                         {laborCharges.map((l, i) => (
                            <div key={i} className="rounded-2xl border border-line p-3">
                               <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-xs text-muted">Labor {i + 1}</span>
                                  <button onClick={() => setLaborCharges(laborCharges.filter((_, x) => x !== i))} className="text-sm font-medium text-danger min-h-touch px-2">Remove</button>
                               </div>
                               <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                                  <input className="input h-11 sm:col-span-9 col-span-2" placeholder="Labor description" value={l.description} onChange={e => { const u = [...laborCharges]; u[i].description = e.target.value; setLaborCharges(u) }} />
                                  <input className="input h-11 sm:col-span-2 nums" type="number" placeholder="Amount" value={l.amount} onChange={e => { const u = [...laborCharges]; u[i].amount = parseFloat(e.target.value) || 0; setLaborCharges(u) }} />
                                  <div className="sm:col-span-1 col-span-2 flex items-center justify-end nums font-medium text-ink">{formatCurrency(l.amount)}</div>
                               </div>
                            </div>
                         ))}
                      </div>
                   ) : (
                      <div className="card-flat text-center py-6 subtle">No labor charges added</div>
                   )}
                </div>
             </div>

             {/* Step 4 — Payment (deposit / request link) */}
             <div className="card">
                <div className="flex items-center justify-between">
                   <h3 className="section-title">4&nbsp;&nbsp;Payment <span className="text-muted font-normal">(optional)</span></h3>
                   {!showDeposit
                      ? <button type="button" onClick={() => setShowDeposit(true)} className="btn-ghost btn-sm">Add deposit</button>
                      : <button type="button" onClick={() => setShowDeposit(false)} className="btn-ghost btn-sm">Hide</button>}
                </div>
                {!showDeposit ? (
                   <p className="field-hint mt-1">No deposit — full balance of {formatCurrency(totals.total)} is due. Add a deposit or request a payment link.</p>
                ) : (
                   <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mt-3">
                         <div>
                            <label className="field-label">Deposit paid (offline)</label>
                            <input type="number" className="input nums" value={deposit} onChange={e => setDeposit(e.target.value)} />
                         </div>
                         <div>
                            <label className="field-label">Request deposit (link)</label>
                            <input type="number" className="input nums" placeholder="0.00" value={requestDepositAmount} onChange={e => setRequestDepositAmount(e.target.value)} />
                         </div>
                         <div className="sm:text-right">
                            <div className="stat-label">Balance due</div>
                            <div className="text-xl font-semibold text-ink nums">{formatCurrency(totals.balanceDue)}</div>
                         </div>
                      </div>
                      {requestDepositAmount > 0 && <p className="field-hint">Status will be "Pending link payment". Confirm receipt to mark as paid.</p>}
                   </>
                )}
             </div>

             {/* Discount (optional, collapsed) */}
             <div className="card">
                <div className="flex items-center justify-between">
                   <h3 className="section-title">Discount <span className="text-muted font-normal">(optional)</span></h3>
                   {!showDiscount
                      ? <button type="button" onClick={() => setShowDiscount(true)} className="btn-ghost btn-sm">Add discount</button>
                      : <button type="button" onClick={() => setShowDiscount(false)} className="btn-ghost btn-sm">Hide</button>}
                </div>
                {showDiscount && (
                   <div className="flex flex-wrap gap-3 items-end mt-3">
                      <div className="segmented">
                         <button className={discountType === 'percentage' ? 'active' : ''} onClick={() => setDiscountType('percentage')}>Percent</button>
                         <button className={discountType === 'fixed' ? 'active' : ''} onClick={() => setDiscountType('fixed')}>Fixed RM</button>
                      </div>
                      <div className="flex-1 min-w-[140px]">
                         <label className="field-label">{discountType === 'percentage' ? 'Discount %' : 'Discount amount (RM)'}</label>
                         <input type="number" className="input nums" placeholder="0" value={discount} onChange={e => setDiscount(e.target.value)} />
                      </div>
                      {Number(discount) > 0 && <div className="text-danger font-medium nums">-{formatCurrency(totals.discountAmount)}</div>}
                   </div>
                )}
             </div>

             {/* Direct lending / BNPL (optional, collapsed) */}
             <div className="card">
                <div className="flex items-center justify-between">
                   <h3 className="section-title">Direct lending <span className="text-muted font-normal">(optional)</span></h3>
                   {!showDirectLending
                      ? <button type="button" onClick={() => setShowDirectLending(true)} className="btn-ghost btn-sm">More options</button>
                      : <button type="button" onClick={() => { setShowDirectLending(false) }} className="btn-ghost btn-sm">Hide</button>}
                </div>
                {showDirectLending && (
                   <>
                      <label className="flex items-center gap-3 cursor-pointer select-none mt-3">
                         <input type="checkbox" className="w-5 h-5 accent-ink" checked={!!useDirectLending} onChange={e => { setUseDirectLending(e.target.checked); if (!e.target.checked) setDirectLendingAmount(0) }} />
                         <span className="font-medium text-ink">Customer uses DirectLending (BNPL)</span>
                      </label>
                      {useDirectLending && (
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mt-3">
                            <div>
                               <label className="field-label">Approved amount (RM)</label>
                               <input type="number" min="0" className="input nums" placeholder="0.00" value={directLendingAmount} onChange={e => setDirectLendingAmount(e.target.value)} />
                            </div>
                            <div className="sm:text-right">
                               <div className="stat-label">DirectLending covers</div>
                               <div className="text-lg font-semibold text-ink nums">{formatCurrency(parseFloat(directLendingAmount) || 0)}</div>
                            </div>
                            <div className="sm:text-right">
                               <div className="stat-label">Customer pays</div>
                               <div className="text-lg font-semibold text-ink nums">{formatCurrency(totals.customerPayableAmount)}</div>
                            </div>
                         </div>
                      )}
                   </>
                )}
             </div>

             {/* Internal costing & commission (repair only, optional, collapsed) */}
             {!isParts && (
                <div className="card">
                   <div className="flex items-center justify-between mb-1">
                      <h3 className="section-title">Mechanic &amp; commission <span className="text-muted font-normal">(optional)</span></h3>
                      {!showCommission
                         ? <button type="button" onClick={() => setShowCommission(true)} className="btn-ghost btn-sm">Mechanic &amp; commission</button>
                         : <button type="button" onClick={() => setShowCommission(false)} className="btn-ghost btn-sm">Hide</button>}
                   </div>
                   {showCommission && (
                   <div className="space-y-4 mt-2">
                      <div>
                         <label className="field-label">Supplier part costs (RM)</label>
                         <input type="number" className="input nums" value={totalPartsSupplierCost} onChange={e => setTotalPartsSupplierCost(e.target.value)} />
                      </div>

                      <div className="border-t border-line pt-3">
                         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                            <label className="field-label mb-0">Mechanic commission</label>
                            <select className="input select h-10 sm:w-56" onChange={addMechanic} value="">
                               <option value="">+ Add mechanic</option>
                               {employees.length > 0 ? employees.map(e => (
                                  <option key={e.id} value={e.id}>{e.name || (e.firstName ? `${e.firstName} ${e.lastName || ''}`.trim() : 'Unnamed Staff')}</option>
                               )) : <option disabled>No staff found</option>}
                            </select>
                         </div>
                         {mechanics.length === 0 && <p className="subtle">No mechanics assigned.</p>}
                         {mechanics.map((m, idx) => (
                            <div key={idx} className="flex flex-wrap gap-2 items-center mb-2 rounded-2xl border border-line p-2">
                               <span className="text-sm font-medium truncate flex-1 min-w-[120px]">{m.name}</span>
                               <select className="input select h-10 w-28" value={m.commissionType} onChange={e => { const n = [...mechanics]; n[idx].commissionType = e.target.value; setMechanics(n) }}>
                                  <option value="percentage">Percent</option>
                                  <option value="fixed">Fixed RM</option>
                               </select>
                               <input type="number" className="input h-10 w-24 nums" value={m.commissionValue} onChange={e => { const n = [...mechanics]; n[idx].commissionValue = e.target.value; setMechanics(n) }} />
                               <span className="nums text-sm w-24 text-right">{formatCurrency(totals.calculatedMechanics[idx]?.commissionAmount)}</span>
                               <button onClick={() => setMechanics(mechanics.filter((_, x) => x !== idx))} className="text-sm font-medium text-danger px-2 min-h-touch">Remove</button>
                            </div>
                         ))}
                         <div className="text-right text-sm text-muted mt-2">Total commission: <b className="text-ink nums">{formatCurrency(totals.commission)}</b></div>
                      </div>
                      <div className="mt-1 text-right text-sm text-muted border-t border-line pt-3">
                         Est. net profit: <b className="text-ok nums">{formatCurrency(totals.total - (Number(totalPartsSupplierCost) || 0) - totals.commission)}</b>
                      </div>
                   </div>
                   )}
                </div>
             )}

             {/* Totals summary */}
             <div className="card">
                {totals.discountAmount > 0 && (
                   <div className="space-y-1 mb-2 text-sm">
                      <div className="flex justify-between text-muted"><span>Subtotal</span><span className="nums">{formatCurrency(totals.subtotal)}</span></div>
                      <div className="flex justify-between text-danger"><span>Discount {discountType === 'fixed' ? '(Fixed)' : `(${discount}%)`}</span><span className="nums">-{formatCurrency(totals.discountAmount)}</span></div>
                   </div>
                )}
                <div className="flex justify-between items-center">
                   <span className="section-title">Total amount</span>
                   <span className="text-2xl font-semibold text-ink nums">{formatCurrency(totals.total)}</span>
                </div>
             </div>

             </div>{/* end steps 2–4 gate */}

             {/* Sticky save bar */}
             <div className="action-bar -mx-4 sm:-mx-0 sm:rounded-2xl">
                <div className="flex-1 min-w-0">
                   <div className="text-xs text-muted">Total</div>
                   <div className="text-lg font-semibold text-ink nums">{formatCurrency(totals.total)}</div>
                   {!canSave && <div className="text-xs text-danger">{saveReason}</div>}
                </div>
                <button onClick={() => setViewMode('list')} className="btn-ghost">Cancel</button>
                <button onClick={handleSaveInvoice} disabled={isSaving || !canSave} title={!canSave ? saveReason : undefined} className="btn-primary">{isSaving ? 'Saving…' : 'Save invoice'}</button>
             </div>
          </div>
       )}

       {/* ── Analysis view ───────────────────────────────── */}
       {viewMode === 'analysis' && (
          <div className="card">
             <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
                <h2 className="section-title">Profit &amp; margin analysis</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                   <input className="input sm:w-64" placeholder="Search…" value={analysisSearch} onChange={e => setAnalysisSearch(e.target.value)} />
                   <button onClick={() => setViewMode('list')} className="btn-ghost">Close</button>
                </div>
             </div>
             <ResponsiveTable
                keyField="id"
                data={analysis.items.filter(i => !analysisSearch || i.customerName?.toLowerCase().includes(analysisSearch.toLowerCase()) || i.invoiceNumber?.toLowerCase().includes(analysisSearch.toLowerCase()))}
                emptyMessage="No invoices to analyze yet."
                columns={[
                   {
                      key: 'invoiceNumber', header: 'Invoice', primary: true,
                      render: (i) => {
                         const isReturn = i.invoiceType === 'return_job' || i.parentInvoiceId || i.parentInvoiceNumber
                         return (
                            <div>
                               <div className="flex items-center gap-2">
                                  <span className="font-medium text-ink">{i.invoiceNumber}</span>
                                  {isReturn && <span className="pill pill-accent">Return</span>}
                               </div>
                               <div className="text-xs text-muted">{i.customerName}</div>
                            </div>
                         )
                      }
                   },
                   { key: 'mechanic', header: 'Mechanic(s)', render: (i) => (i.mechanics || []).map(m => `${m.name} (${formatCurrency(m.commissionAmount)})`).join(', ') || '—' },
                   { key: 'rev', header: 'Revenue', align: 'right', render: (i) => <span className="nums">{formatCurrency(i.customerTotal || i.total)}</span> },
                   { key: 'cost', header: 'Cost', align: 'right', render: (i) => <span className="nums text-danger">{formatCurrency(i.calculatedCost)}</span> },
                   { key: 'profit', header: 'Net profit', align: 'right', render: (i) => <span className="nums font-medium text-ok">{formatCurrency(i.calculatedProfit)}</span> },
                   { key: 'margin', header: 'Margin', align: 'right', render: (i) => <span className={`nums font-medium ${i.calculatedProfit > 0 ? 'text-ok' : 'text-danger'}`}>{i.calculatedProfit > 0 ? ((i.calculatedProfit / (i.customerTotal || 1)) * 100).toFixed(0) : 0}%</span> },
                ]}
             />
          </div>
       )}

       {/* ── Receipt modal ───────────────────────────────── */}
       {showReceipt && (
          <InvoicePreview
              invoice={{
                  invoiceNumber: showReceipt.invoiceNumber,
                  dateCreated: showReceipt.dateCreated,
                  documentMode: showReceipt.documentMode || 'repair',
                  customerInfo: {
                      name: showReceipt.customerName,
                      phone: showReceipt.customerPhone,
                      email: showReceipt.customerEmail,
                      ic: showReceipt.customerIC || '',
                      address: showReceipt.customerAddress || ''
                  },
                  vehicleInfo: showReceipt.vehicleInfo || {},
                  items: [
                  ...(showReceipt.partsOrdered || []).map(p => ({
                      kodProduk: p.sku || 'PART',
                      namaProduk: p.partName,
                      quantity: Number(p.quantity),
                      finalPrice: Number(p.pricePerUnit),
                      totalPrice: Number(p.total)
                  })),
                  ...(showReceipt.laborCharges || []).map(l => ({
                      kodProduk: 'LABOR',
                      namaProduk: l.description,
                      quantity: 1,
                      finalPrice: Number(l.amount),
                      totalPrice: Number(l.amount),
                      type: 'labor'
                  }))
                  ],
                  subtotal: Number(showReceipt.subtotal || 0),
                  totalAmount: Number(showReceipt.total || showReceipt.customerTotal || 0),
                  deposit: Number(showReceipt.deposit || 0),
                  balanceDue: 0,
                  discount: showReceipt.discount || 0,
                  discountType: showReceipt.discountType || 'percentage',
                  discountAmount: showReceipt.discountAmount || 0,
                  notes: showReceipt.notes || (showReceipt.workDescription ? `Work: ${showReceipt.workDescription}` : '')
              }}
              onClose={() => setShowReceipt(null)}
              isViewMode={true}
              isReceipt={true}
          />
       )}

       {/* ── Invoice view / PDF modal ────────────────────── */}
       {viewInvoice && (
          showPDF ? (
            <InvoicePreview
                invoice={{
                    invoiceNumber: viewInvoice.invoiceNumber,
                    dateCreated: viewInvoice.dateCreated,
                    documentMode: viewInvoice.documentMode || 'repair',
                    customerInfo: {
                        name: viewInvoice.customerName,
                        phone: viewInvoice.customerPhone,
                        email: viewInvoice.customerEmail,
                        ic: viewInvoice.customerIC || '',
                        address: viewInvoice.customerAddress || ''
                    },
                    vehicleInfo: viewInvoice.vehicleInfo || {},
                    items: [
                    ...(viewInvoice.partsOrdered || []).map(p => ({
                        kodProduk: p.sku || 'PART',
                        namaProduk: p.partName,
                        quantity: Number(p.quantity),
                        finalPrice: Number(p.pricePerUnit),
                        totalPrice: Number(p.total)
                    })),
                    ...(viewInvoice.laborCharges || []).map(l => ({
                        kodProduk: 'LABOR',
                        namaProduk: l.description,
                        quantity: 1,
                        finalPrice: Number(l.amount),
                        totalPrice: Number(l.amount),
                        type: 'labor'
                    }))
                    ],
                    subtotal: Number(viewInvoice.subtotal || 0),
                    totalAmount: Number(viewInvoice.total || viewInvoice.customerTotal || 0),
                    deposit: Number(viewInvoice.deposit || 0),
                    balanceDue: Number(viewInvoice.balanceDue ?? ((viewInvoice.total || viewInvoice.customerTotal || 0) - (viewInvoice.deposit || 0))),
                    discount: viewInvoice.discount || 0,
                    discountType: viewInvoice.discountType || 'percentage',
                    discountAmount: viewInvoice.discountAmount || 0,
                    notes: viewInvoice.notes || (viewInvoice.workDescription ? `Work: ${viewInvoice.workDescription}` : '')
                }}
                onClose={() => setShowPDF(false)}
                isViewMode={true}
            />
          ) : (
            <ResponsiveModal
               isOpen={!!viewInvoice}
               onClose={() => setViewInvoice(null)}
               title={`Invoice ${viewInvoice.invoiceNumber}`}
               size="xl"
               footer={
                  <>
                     <button className="btn-ghost" onClick={() => setViewInvoice(null)}>Close</button>
                     <button className="btn-primary" onClick={() => setShowPDF(true)}>Print / PDF</button>
                  </>
               }
            >
               <div className="space-y-6">
                  <div className="flex items-center gap-2">
                     {(() => { const p = paymentPill(viewInvoice); return <span className={`pill ${p.cls}`}>{p.label}</span> })()}
                     {viewInvoice.documentMode === 'parts' && <span className="pill pill-muted">Parts sale</span>}
                     {viewInvoice.useDirectLending && <span className="pill pill-accent">BNPL</span>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="panel p-4">
                        <h3 className="stat-label mb-2">Customer</h3>
                        <p className="font-medium text-ink text-lg">{viewInvoice.customerName}</p>
                        <p className="text-muted text-sm">{viewInvoice.customerPhone}</p>
                        <p className="text-muted text-sm">{viewInvoice.customerEmail}</p>
                        {viewInvoice.customerIC && <p className="text-muted text-sm">IC: {viewInvoice.customerIC}</p>}
                        {viewInvoice.customerAddress && <p className="text-muted text-sm">{viewInvoice.customerAddress}</p>}
                     </div>
                     {viewInvoice.documentMode !== 'parts' && (
                        <div className="panel p-4">
                           <h3 className="stat-label mb-2">Vehicle</h3>
                           {viewInvoice.vehicleInfo ? (
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                 <div><div className="text-muted text-xs">Make/Model</div><div className="font-medium text-ink">{viewInvoice.vehicleInfo.make} {viewInvoice.vehicleInfo.model}</div></div>
                                 <div><div className="text-muted text-xs">Plate no</div><div className="font-medium text-ink">{viewInvoice.vehicleInfo.plate || '—'}</div></div>
                              </div>
                           ) : <p className="subtle">No vehicle info.</p>}
                        </div>
                     )}
                  </div>

                  <div className="panel divide-y divide-line">
                     <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        <div className="col-span-6">Description</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-right">Unit</div>
                        <div className="col-span-2 text-right">Total</div>
                     </div>
                     {(viewInvoice.partsOrdered || []).map((p, idx) => (
                        <div key={`p-${idx}`} className="grid grid-cols-12 px-4 py-3 text-sm">
                           <div className="col-span-6"><div className="font-medium text-ink">{p.partName}</div><div className="text-xs text-muted">{p.sku}</div></div>
                           <div className="col-span-2 text-center text-muted nums">{p.quantity}</div>
                           <div className="col-span-2 text-right text-muted nums">{formatCurrency(p.pricePerUnit)}</div>
                           <div className="col-span-2 text-right font-medium text-ink nums">{formatCurrency(p.total)}</div>
                        </div>
                     ))}
                     {(viewInvoice.laborCharges || []).map((l, idx) => (
                        <div key={`l-${idx}`} className="grid grid-cols-12 px-4 py-3 text-sm">
                           <div className="col-span-6"><div className="font-medium text-ink">{l.description}</div><span className="pill pill-muted mt-1">Labor</span></div>
                           <div className="col-span-2 text-center text-muted nums">1</div>
                           <div className="col-span-2 text-right text-muted nums">{formatCurrency(l.amount)}</div>
                           <div className="col-span-2 text-right font-medium text-ink nums">{formatCurrency(l.amount)}</div>
                        </div>
                     ))}
                     {(!viewInvoice.partsOrdered?.length && !viewInvoice.laborCharges?.length) && (
                        <div className="px-4 py-8 text-center subtle">No line items found.</div>
                     )}
                  </div>

                  <div className="flex justify-end">
                     <div className="w-full sm:w-80 space-y-2">
                        <div className="flex justify-between text-muted"><span>Subtotal</span><span className="nums">{formatCurrency(viewInvoice.subtotal || viewInvoice.total || viewInvoice.customerTotal)}</span></div>
                        {viewInvoice.discountAmount > 0 && (
                           <div className="flex justify-between text-danger"><span>Discount {viewInvoice.discountType === 'fixed' ? '(Fixed)' : `(${viewInvoice.discount || 0}%)`}</span><span className="nums">-{formatCurrency(viewInvoice.discountAmount)}</span></div>
                        )}
                        <div className="flex justify-between text-ink"><span>Total</span><span className="nums font-medium">{formatCurrency(viewInvoice.total || viewInvoice.customerTotal)}</span></div>
                        <div className="flex justify-between text-muted"><span>Deposit paid</span><span className="nums text-danger">-{formatCurrency(viewInvoice.deposit || 0)}</span></div>
                        <div className="flex justify-between items-center pt-2 border-t border-line">
                           <span className="section-title">Balance due</span>
                           <span className="text-2xl font-semibold text-ink nums">{formatCurrency(Math.max(0, (viewInvoice.total || viewInvoice.customerTotal || 0) - (viewInvoice.deposit || 0)))}</span>
                        </div>
                     </div>
                  </div>
               </div>
            </ResponsiveModal>
         )
       )}

       {/* ── Customer selection modal ────────────────────── */}
       <ResponsiveModal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Select customer" size="md">
          <input autoFocus className="input mb-3" placeholder="Search name or phone…" value={customerSearchTerm} onChange={e => setCustomerSearchTerm(e.target.value)} />
          <div className="max-h-[60vh] overflow-y-auto touch-scroll space-y-2">
             {customers.filter(c => {
                const term = customerSearchTerm.toLowerCase()
                return c.name?.toLowerCase().includes(term) || c.phone?.toLowerCase().includes(term)
             }).map(c => (
                <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustomerModal(false) }} className="w-full text-left rounded-2xl border border-line px-4 py-3 hover:bg-black/[0.02] min-h-touch">
                   <div className="font-medium text-ink break-words">{c.name}</div>
                   <div className="text-sm text-muted">{c.phone || ''}</div>
                </button>
             ))}
             {customers.length === 0 && <p className="subtle text-center py-6">No customers found.</p>}
          </div>
       </ResponsiveModal>

       {/* ── Inventory part picker ───────────────────────── */}
       <ResponsiveModal isOpen={showPartPicker} onClose={() => setShowPartPicker(false)} title="Add part from inventory" size="lg">
          <PartsSelector onAddPart={addInventoryPart} selectedParts={manualParts} />
          <div className="mt-4 pt-3 border-t border-line">
             <button onClick={() => { addCustomPart(); setShowPartPicker(false) }} className="btn-ghost btn-block">
                Add a custom (non-inventory) line instead
             </button>
          </div>
       </ResponsiveModal>

       {/* ── Payment link modal ──────────────────────────── */}
       <ResponsiveModal isOpen={paymentLinkModal.show} onClose={() => setPaymentLinkModal({ ...paymentLinkModal, show: false })} title="Payment link" size="sm">
          {paymentLinkModal.url ? (
             <div className="space-y-4">
                <p className="text-xs bg-ok/10 text-ok p-3 rounded-xl break-all">{paymentLinkModal.url}</p>
                <div className="flex gap-2">
                   <button onClick={() => window.open(paymentLinkModal.url)} className="btn-primary flex-1">Open link</button>
                   <button onClick={() => { navigator.clipboard.writeText(paymentLinkModal.url); alert('Link copied!') }} className="btn-secondary">Copy</button>
                </div>
                <div className="pt-3 border-t border-line">
                   <p className="field-hint mb-2">Need a different amount or new link?</p>
                   <button onClick={() => setPaymentLinkModal({ ...paymentLinkModal, url: null })} className="btn-secondary btn-block">
                      Create {paymentLinkModal.invoice?.depositStatus?.includes('paid') ? 'balance' : 'new'} link
                   </button>
                </div>
                {!paymentLinkModal.confirmed && paymentLinkModal.invoice?.depositStatus !== 'paid_link' && (
                   <div className="rounded-xl border border-line p-3">
                      <p className="font-medium text-ink text-sm">Admin verification</p>
                      <p className="subtle mb-2">Did the customer pay via this link?</p>
                      <button onClick={() => { confirmDepositPaid(paymentLinkModal.invoice); setPaymentLinkModal({ ...paymentLinkModal, show: false }) }} className="btn-accent btn-block btn-sm">Yes, mark deposit paid</button>
                   </div>
                )}
             </div>
          ) : (
             <div className="space-y-4">
                <div>
                   <label className="field-label">Amount to collect (RM)</label>
                   <input type="number" value={paymentLinkModal.amount} onChange={e => setPaymentLinkModal({ ...paymentLinkModal, amount: e.target.value })} className="input nums text-2xl text-center" placeholder="0.00" />
                </div>
                {paymentLinkModal.error && <p className="text-xs text-danger">{paymentLinkModal.error}</p>}
                <button onClick={generateLink} disabled={paymentLinkModal.loading || !paymentLinkModal.amount} className="btn-primary btn-block">{paymentLinkModal.loading ? 'Generating…' : 'Generate link'}</button>
             </div>
          )}
       </ResponsiveModal>
    </div>
  )
}

export default CustomerInvoiceCreation
