import { useState, useEffect, useMemo } from 'react'
import { collection, query, orderBy, onSnapshot, updateDoc, doc, addDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { ResponsiveModal, ResponsiveTable, StatsGrid } from './ui'

const fmtCurrency = (v) =>
  new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(Number(v) || 0)
const fmtDate = (d) =>
  d instanceof Date && !isNaN(d)
    ? d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

// Robust date coercion: Firestore Timestamp -> Date, ISO/number -> Date, else null.
const toDate = (raw) => {
  const dt = raw?.toDate?.() ?? (raw ? new Date(raw) : null)
  return dt instanceof Date && !isNaN(dt) ? dt : null
}

const emptyPayment = { invoiceId: '', invoiceSearch: '', amount: '', paymentMethod: 'cash', referenceNumber: '', notes: '' }

const TIMEFRAMES = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

function AccountingDashboard() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('month')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState(emptyPayment)
  const [saving, setSaving] = useState(false)

  const [customerInvoices, setCustomerInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [accountingSearch, setAccountingSearch] = useState('')

  useEffect(() => {
    const invoicesQuery = query(collection(db, 'customer_invoices'), orderBy('dateCreated', 'desc'))
    const unsubInvoices = onSnapshot(
      invoicesQuery,
      (snapshot) => {
        const invoices = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          _date: toDate(d.data().dateCreated),
        }))
        setCustomerInvoices(invoices)
        setIsLoading(false)
      },
      (err) => {
        console.error('Error loading invoices:', err)
        setIsLoading(false)
      }
    )
    return () => unsubInvoices()
  }, [])

  // --- Timeframe filter (robust date handling) ---
  // Invalid / missing dates are excluded from month/year, but included in 'all'.
  const filteredInvoices = useMemo(() => {
    if (selectedTimeframe === 'all') return customerInvoices
    const now = new Date()
    return customerInvoices.filter((inv) => {
      const dt = inv._date
      if (!dt) return false
      if (selectedTimeframe === 'month') {
        return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()
      }
      if (selectedTimeframe === 'year') return dt.getFullYear() === now.getFullYear()
      return true
    })
  }, [customerInvoices, selectedTimeframe])

  // --- Stats ---
  // Revenue = Σ(customerTotal||total). Collected = Σ(deposit) actual payments.
  // Outstanding = Σ(balanceDue) for invoices not fully paid.
  const stats = useMemo(() => {
    const revenue = filteredInvoices.reduce((sum, inv) => sum + (Number(inv.customerTotal ?? inv.total) || 0), 0)
    const collected = filteredInvoices.reduce((sum, inv) => sum + (Number(inv.deposit) || 0), 0)
    const outstanding = filteredInvoices
      .filter((i) => i.paymentStatus !== 'paid')
      .reduce((sum, inv) => sum + (Number(inv.balanceDue) || 0), 0)
    const collectedPct = revenue > 0 ? Math.min(100, Math.max(0, (collected / revenue) * 100)) : 0
    return { revenue, collected, outstanding, collectedPct, invoiceCount: filteredInvoices.length }
  }, [filteredInvoices])

  // --- Search-filtered lists ---
  const matchesSearch = (i) => {
    const s = accountingSearch.trim().toLowerCase()
    if (!s) return true
    return (i.customerName || '').toLowerCase().includes(s) || (i.invoiceNumber || '').toLowerCase().includes(s)
  }

  const pendingInvoices = useMemo(
    () => filteredInvoices.filter((i) => i.paymentStatus !== 'paid').filter(matchesSearch),
    [filteredInvoices, accountingSearch]
  )
  const paidInvoices = useMemo(
    () => filteredInvoices.filter((i) => i.paymentStatus === 'paid' || i.paymentStatus === 'deposit-paid').filter(matchesSearch),
    [filteredInvoices, accountingSearch]
  )

  // Selectable invoices for the payment form (unpaid only, across all timeframes)
  const selectableInvoices = useMemo(() => {
    const s = (paymentData.invoiceSearch || '').trim().toLowerCase()
    return customerInvoices
      .filter((i) => i.paymentStatus !== 'paid')
      .filter((i) => !s || (i.invoiceNumber || '').toLowerCase().includes(s) || (i.customerName || '').toLowerCase().includes(s))
  }, [customerInvoices, paymentData.invoiceSearch])

  const selectedInvoice = useMemo(
    () => customerInvoices.find((i) => i.id === paymentData.invoiceId) || null,
    [customerInvoices, paymentData.invoiceId]
  )

  const openPaymentModal = () => {
    setPaymentData(emptyPayment)
    setShowPaymentModal(true)
  }

  const handleSelectInvoice = (id) => {
    const inv = customerInvoices.find((i) => i.id === id)
    setPaymentData((prev) => ({
      ...prev,
      invoiceId: id,
      amount: inv ? String(Number(inv.balanceDue ?? inv.customerTotal ?? inv.total) || 0) : '',
    }))
  }

  const handlePaymentSubmit = async (e) => {
    e.preventDefault()
    if (!selectedInvoice) return alert('Please select an invoice.')
    const amount = parseFloat(paymentData.amount)
    if (!amount || amount <= 0) return alert('Please enter a valid payment amount.')

    setSaving(true)
    try {
      const total = Number(selectedInvoice.customerTotal ?? selectedInvoice.total) || 0
      const newDeposit = (Number(selectedInvoice.deposit) || 0) + amount
      const newBalance = total - newDeposit
      const newStatus = newBalance <= 1 ? 'paid' : newDeposit > 0 ? 'deposit-paid' : 'pending'

      const invoiceRef = doc(db, 'customer_invoices', selectedInvoice.id)
      await updateDoc(invoiceRef, {
        deposit: newDeposit,
        balanceDue: newBalance,
        paymentStatus: newStatus,
        status: newStatus,
        lastPaymentDate: Timestamp.now(),
        paymentHistory: [
          ...(selectedInvoice.paymentHistory || []),
          {
            amount,
            date: Timestamp.now(),
            paymentMethod: paymentData.paymentMethod,
            referenceNumber: paymentData.referenceNumber || '',
            notes: paymentData.notes || '',
            recordedBy: 'Accounting Dashboard',
          },
        ],
      })

      // Ledger row in the transactions collection
      await addDoc(collection(db, 'transactions'), {
        invoiceId: selectedInvoice.id,
        invoiceNumber: selectedInvoice.invoiceNumber || '',
        customerName: selectedInvoice.customerName || '',
        transactionNumber: 'TXN-' + Date.now(),
        amount,
        paymentMethod: paymentData.paymentMethod,
        paymentDate: Timestamp.now(),
        status: 'completed',
        notes: paymentData.notes || '',
      })

      alert(`Payment of ${fmtCurrency(amount)} recorded successfully.`)
      setShowPaymentModal(false)
      setPaymentData(emptyPayment)
    } catch (error) {
      console.error('Error recording payment:', error)
      alert('Failed to record payment. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const statusPill = (s) =>
    s === 'paid' ? 'pill-ok' : s === 'deposit-paid' ? 'pill-warn' : s === 'overdue' ? 'pill-danger' : 'pill-muted'

  const pendingColumns = [
    {
      key: 'invoiceNumber',
      header: 'Invoice',
      primary: true,
      render: (r) => (
        <div>
          <div className="font-medium text-ink">{r.invoiceNumber || '—'}</div>
          <div className="text-xs text-muted truncate max-w-[200px]">{r.customerName || 'Walk-in'}</div>
        </div>
      ),
    },
    { key: 'customerName', header: 'Customer', hideOnMobile: true, render: (r) => r.customerName || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className={`pill ${statusPill(r.paymentStatus)}`}>{(r.paymentStatus || 'pending').replace('-', ' ')}</span>
      ),
    },
    {
      key: 'balanceDue',
      header: 'Balance',
      align: 'right',
      render: (r) => (
        <span className="nums font-semibold text-danger">
          {fmtCurrency(r.balanceDue ?? r.customerTotal ?? r.total)}
        </span>
      ),
    },
  ]

  const paidColumns = [
    {
      key: 'invoiceNumber',
      header: 'Invoice',
      primary: true,
      render: (r) => (
        <div>
          <div className="font-medium text-ink">{r.invoiceNumber || '—'}</div>
          <div className="text-xs text-muted truncate max-w-[200px]">{r.customerName || 'Walk-in'}</div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      hideOnMobile: true,
      render: (r) => fmtDate(r._date),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className={`pill ${statusPill(r.paymentStatus)}`}>{(r.paymentStatus || 'pending').replace('-', ' ')}</span>
      ),
    },
    {
      key: 'collected',
      header: 'Collected',
      align: 'right',
      render: (r) => <span className="nums font-semibold text-ok">{fmtCurrency(r.deposit ?? r.customerTotal ?? r.total)}</span>,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header + timeframe */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="page-title">Financial overview</h2>
          <p className="subtle">Track revenue, payments collected, and outstanding balances.</p>
        </div>
        <div className="segmented self-start">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              className={selectedTimeframe === t.key ? 'active' : ''}
              aria-pressed={selectedTimeframe === t.key}
              onClick={() => setSelectedTimeframe(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <StatsGrid
        columns={{ sm: 2, md: 2, lg: 4 }}
        stats={[
          { label: 'Total revenue', value: fmtCurrency(stats.revenue), sublabel: `${stats.invoiceCount} invoice${stats.invoiceCount === 1 ? '' : 's'}` },
          { label: 'Collected', value: fmtCurrency(stats.collected), sublabel: `${stats.collectedPct.toFixed(0)}% of revenue` },
          { label: 'Outstanding', value: fmtCurrency(stats.outstanding), sublabel: 'Unpaid balances' },
          { label: 'Record payment', value: 'Add', sublabel: 'Log a manual payment', onClick: openPaymentModal },
        ]}
      />

      {/* Collection progress */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="stat-label">Collection progress</span>
          <span className="nums text-sm font-medium text-ink">{stats.collectedPct.toFixed(0)}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-black/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${stats.collectedPct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted">
          <span>Collected {fmtCurrency(stats.collected)}</span>
          <span>Outstanding {fmtCurrency(stats.outstanding)}</span>
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <input
          className="input sm:max-w-xs"
          placeholder="Search invoice # or customer…"
          value={accountingSearch}
          onChange={(e) => setAccountingSearch(e.target.value)}
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title text-base">Pending invoices</h3>
            {pendingInvoices.length > 0 && <span className="pill pill-warn">{pendingInvoices.length} open</span>}
          </div>
          <ResponsiveTable
            columns={pendingColumns}
            data={pendingInvoices.slice(0, 12)}
            keyField="id"
            loading={isLoading}
            emptyMessage={accountingSearch ? 'No pending invoices match your search.' : 'No pending invoices.'}
          />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title text-base">Recent payments</h3>
            {paidInvoices.length > 0 && <span className="pill pill-ok">{paidInvoices.length}</span>}
          </div>
          <ResponsiveTable
            columns={paidColumns}
            data={paidInvoices.slice(0, 12)}
            keyField="id"
            loading={isLoading}
            emptyMessage={accountingSearch ? 'No payments match your search.' : 'No payments recorded yet.'}
          />
        </div>
      </div>

      {/* Record payment modal */}
      <ResponsiveModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Record payment"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowPaymentModal(false)} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handlePaymentSubmit} disabled={saving}>
              {saving ? 'Recording…' : 'Record payment'}
            </button>
          </>
        }
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          <div>
            <label className="field-label req">Find invoice</label>
            <input
              className="input mb-2"
              placeholder="Search by invoice # or customer…"
              value={paymentData.invoiceSearch}
              onChange={(e) => setPaymentData({ ...paymentData, invoiceSearch: e.target.value })}
            />
            <select className="input select" value={paymentData.invoiceId} onChange={(e) => handleSelectInvoice(e.target.value)}>
              <option value="">— Choose an invoice —</option>
              {selectableInvoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNumber} · {i.customerName || 'Walk-in'} ({fmtCurrency(i.balanceDue ?? i.customerTotal ?? i.total)})
                </option>
              ))}
            </select>
          </div>

          {selectedInvoice && (
            <div className="card-flat text-sm">
              <div className="flex justify-between py-1">
                <span className="text-muted">Invoice total</span>
                <span className="nums font-medium text-ink">{fmtCurrency(selectedInvoice.customerTotal ?? selectedInvoice.total)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">Already paid</span>
                <span className="nums font-medium text-ink">{fmtCurrency(selectedInvoice.deposit)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">Balance due</span>
                <span className="nums font-semibold text-danger">{fmtCurrency(selectedInvoice.balanceDue ?? selectedInvoice.customerTotal ?? selectedInvoice.total)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="field-label req">Amount (RM)</label>
            <input
              className="input nums"
              type="number"
              step="0.01"
              min="0"
              value={paymentData.amount}
              onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="field-label">Payment method</label>
            <select
              className="input select"
              value={paymentData.paymentMethod}
              onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
              <option value="online_link">Online link</option>
            </select>
          </div>

          <div>
            <label className="field-label">Reference no.</label>
            <input
              className="input"
              value={paymentData.referenceNumber}
              onChange={(e) => setPaymentData({ ...paymentData, referenceNumber: e.target.value })}
              placeholder="optional"
            />
          </div>

          <div>
            <label className="field-label">Notes</label>
            <textarea
              className="input textarea"
              value={paymentData.notes}
              onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
              placeholder="optional"
            />
          </div>
        </form>
      </ResponsiveModal>
    </div>
  )
}

export default AccountingDashboard
