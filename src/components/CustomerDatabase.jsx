import { useState, useEffect, useMemo } from 'react'
import { useCustomer } from '../context/CustomerContext'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { createCustomer, updateCustomer, deleteCustomer } from '../utils/FirebaseDataUtils'
import { ResponsiveModal, ResponsiveTable, StatsGrid } from './ui'

const fmtCurrency = (v) =>
  new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(Number(v) || 0)
const fmtDate = (d) =>
  d instanceof Date && !isNaN(d)
    ? d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

const emptyForm = { name: '', phone: '', email: '', ic: '', address: '' }

function CustomerDatabase({ setActiveSection, openInvoice }) {
  const { customers, isLoadingCustomers, loadCustomers, selectCustomer } = useCustomer()

  const [inv, setInv] = useState({ byId: {}, loading: true })
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(emptyForm)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchInvoices = async () => {
    try {
      const snap = await getDocs(collection(db, 'customer_invoices'))
      const byId = {}
      snap.forEach((d) => {
        const x = { id: d.id, ...d.data() }
        const key = x.customerId || `noid:${x.customerName || 'Unknown'}`
        if (!byId[key]) {
          byId[key] = {
            customerId: x.customerId || null,
            name: x.customerName || 'Unknown',
            phone: x.customerPhone || '',
            email: x.customerEmail || '',
            address: x.customerAddress || '',
            totalSpent: 0, visits: 0, lastDate: null, invoices: [],
          }
        }
        const g = byId[key]
        g.totalSpent += Number(x.customerTotal || x.total || 0)
        g.visits += 1
        g.invoices.push(x)
        const dt = x.dateCreated?.toDate ? x.dateCreated.toDate() : x.dateCreated ? new Date(x.dateCreated) : null
        if (dt && !isNaN(dt) && (!g.lastDate || dt > g.lastDate)) g.lastDate = dt
      })
      setInv({ byId, loading: false })
    } catch (e) {
      console.error('Error loading invoices for customer stats:', e)
      setInv({ byId: {}, loading: false })
    }
  }

  useEffect(() => { fetchInvoices() }, [])

  const refresh = () => { loadCustomers(); fetchInvoices() }

  // Merge customer records with their invoice-derived stats (+ walk-in invoice-only customers)
  const rows = useMemo(() => {
    const known = new Set(customers.map((c) => c.id))
    const base = customers.map((c) => {
      const s = inv.byId[c.id] || {}
      return { ...c, totalSpent: s.totalSpent || 0, visits: s.visits || 0, lastDate: s.lastDate || null, invoices: s.invoices || [] }
    })
    const extra = Object.values(inv.byId)
      .filter((s) => !(s.customerId && known.has(s.customerId)))
      .map((s) => ({
        id: s.customerId || `walkin:${s.name}`,
        name: s.name, phone: s.phone, email: s.email, address: s.address, ic: '',
        totalSpent: s.totalSpent, visits: s.visits, lastDate: s.lastDate, invoices: s.invoices, walkIn: true,
      }))
    return [...base, ...extra].sort((a, b) => (b.lastDate?.getTime() || 0) - (a.lastDate?.getTime() || 0))
  }, [customers, inv])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(
      (r) => (r.name || '').toLowerCase().includes(t) || (r.phone || '').includes(q.trim()) || (r.email || '').toLowerCase().includes(t)
    )
  }, [rows, q])

  const stats = useMemo(() => {
    const withSpend = rows.filter((r) => r.totalSpent > 0)
    const active = rows.filter((r) => r.lastDate && (Date.now() - r.lastDate.getTime()) / 86400000 <= 30)
    return {
      total: rows.length,
      active: active.length,
      avg: withSpend.length ? withSpend.reduce((a, r) => a + r.totalSpent, 0) / withSpend.length : 0,
    }
  }, [rows])

  const openDetail = (r) => { setSelected(r); setEditing(false) }
  const handleNewInvoice = (r) => {
    if (openInvoice) openInvoice({ mode: 'repair', customer: r })
    else { selectCustomer(r); setActiveSection('customer-invoicing') }
  }

  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.phone.trim()) return alert('Name and phone are required.')
    setSaving(true)
    try {
      await createCustomer(addForm)
      setShowAdd(false)
      setAddForm(emptyForm)
      refresh()
    } catch (e) { alert('Could not add customer. Please try again.') } finally { setSaving(false) }
  }

  const startEdit = () => {
    setEditForm({ name: selected.name || '', phone: selected.phone || '', email: selected.email || '', ic: selected.ic || '', address: selected.address || '' })
    setEditing(true)
  }
  const handleSaveEdit = async () => {
    if (!editForm.name.trim() || !editForm.phone.trim()) return alert('Name and phone are required.')
    setSaving(true)
    try {
      await updateCustomer(selected.id, editForm)
      setSelected({ ...selected, ...editForm })
      setEditing(false)
      refresh()
    } catch (e) { alert('Could not save changes.') } finally { setSaving(false) }
  }
  const handleDelete = async () => {
    if (!confirm(`Delete ${selected.name}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await deleteCustomer(selected.id)
      setSelected(null)
      refresh()
    } catch (e) { alert('Could not delete customer.') } finally { setSaving(false) }
  }

  const columns = [
    {
      key: 'name', header: 'Customer', primary: true,
      render: (r) => (
        <div>
          <div className="font-medium text-ink">{r.name}{r.walkIn && <span className="pill pill-muted ml-2">walk-in</span>}</div>
          {r.address && <div className="text-xs text-muted truncate max-w-[240px]">{r.address}</div>}
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
    { key: 'visits', header: 'Visits', align: 'right', render: (r) => <span className="nums">{r.visits || 0}</span> },
    { key: 'totalSpent', header: 'Total spent', align: 'right', render: (r) => <span className="nums font-medium">{fmtCurrency(r.totalSpent)}</span> },
    { key: 'lastDate', header: 'Last visit', align: 'right', render: (r) => fmtDate(r.lastDate) },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <button className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleNewInvoice(r) }}>New invoice</button>
      ),
    },
  ]

  const field = (label, key, form, setForm, opts = {}) => (
    <div>
      <label className={`field-label ${opts.required ? 'req' : ''}`}>{label}</label>
      {opts.textarea ? (
        <textarea className="input textarea" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={opts.placeholder} />
      ) : (
        <input className="input" type={opts.type || 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={opts.placeholder} />
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <StatsGrid
        columns={{ sm: 3, md: 3, lg: 3 }}
        stats={[
          { label: 'Total customers', value: stats.total },
          { label: 'Active (30 days)', value: stats.active },
          { label: 'Avg. spend', value: fmtCurrency(stats.avg) },
        ]}
      />

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
          <input
            className="input sm:max-w-xs"
            placeholder="Search name, phone, or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn-primary" onClick={() => { setAddForm(emptyForm); setShowAdd(true) }}>Add customer</button>
        </div>

        <ResponsiveTable
          columns={columns}
          data={filtered}
          keyField="id"
          onRowClick={openDetail}
          loading={isLoadingCustomers || inv.loading}
          emptyMessage={q ? 'No customers match your search.' : 'No customers yet — add your first one.'}
        />
      </div>

      {/* Add customer */}
      <ResponsiveModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add customer"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add customer'}</button>
          </>
        }
      >
        <div className="space-y-4">
          {field('Full name', 'name', addForm, setAddForm, { required: true, placeholder: 'e.g. Ali bin Abu' })}
          {field('Phone', 'phone', addForm, setAddForm, { required: true, type: 'tel', placeholder: 'e.g. 012-3456789' })}
          {field('Email', 'email', addForm, setAddForm, { type: 'email', placeholder: 'optional' })}
          {field('IC / Reg no.', 'ic', addForm, setAddForm, { placeholder: 'optional' })}
          {field('Address', 'address', addForm, setAddForm, { textarea: true, placeholder: 'optional' })}
        </div>
      </ResponsiveModal>

      {/* Customer detail */}
      <ResponsiveModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name}
        size="lg"
        footer={
          editing ? (
            <>
              <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </>
          ) : (
            <>
              {!selected?.walkIn && <button className="btn-ghost text-danger" onClick={handleDelete} disabled={saving}>Delete</button>}
              {!selected?.walkIn && <button className="btn-secondary" onClick={startEdit}>Edit</button>}
              <button className="btn-primary" onClick={() => { handleNewInvoice(selected) }}>New invoice</button>
            </>
          )
        }
      >
        {selected && !editing && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="stat"><div className="stat-label">Spent</div><div className="stat-value text-lg">{fmtCurrency(selected.totalSpent)}</div></div>
              <div className="stat"><div className="stat-label">Visits</div><div className="stat-value text-lg">{selected.visits || 0}</div></div>
              <div className="stat"><div className="stat-label">Last visit</div><div className="stat-value text-base">{fmtDate(selected.lastDate)}</div></div>
            </div>

            <dl className="divide-y divide-line rounded-2xl border border-line">
              {[['Phone', selected.phone], ['Email', selected.email], ['IC / Reg no.', selected.ic], ['Address', selected.address]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <dt className="text-muted shrink-0">{k}</dt>
                  <dd className="text-ink text-right break-words">{v || '—'}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h4 className="section-title text-base mb-2">Invoice history</h4>
              {selected.invoices?.length ? (
                <div className="space-y-2">
                  {selected.invoices
                    .slice()
                    .sort((a, b) => {
                      const da = a.dateCreated?.toDate ? a.dateCreated.toDate() : new Date(a.dateCreated)
                      const dbb = b.dateCreated?.toDate ? b.dateCreated.toDate() : new Date(b.dateCreated)
                      return (dbb?.getTime() || 0) - (da?.getTime() || 0)
                    })
                    .map((iv) => {
                      const dt = iv.dateCreated?.toDate ? iv.dateCreated.toDate() : iv.dateCreated ? new Date(iv.dateCreated) : null
                      const paid = iv.paymentStatus === 'paid'
                      return (
                        <div key={iv.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                          <div className="min-w-0">
                            <div className="font-medium text-ink">{iv.invoiceNumber}</div>
                            <div className="text-xs text-muted">{fmtDate(dt)}{iv.vehicleInfo?.plate ? ` · ${iv.vehicleInfo.plate}` : ''}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="nums font-medium text-ink">{fmtCurrency(iv.customerTotal || iv.total)}</div>
                            <span className={`pill ${paid ? 'pill-ok' : iv.paymentStatus === 'deposit-paid' ? 'pill-warn' : 'pill-muted'}`}>
                              {(iv.paymentStatus || 'pending').replace('-', ' ')}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <p className="subtle">No invoices yet.</p>
              )}
            </div>
          </div>
        )}

        {selected && editing && (
          <div className="space-y-4">
            {field('Full name', 'name', editForm, setEditForm, { required: true })}
            {field('Phone', 'phone', editForm, setEditForm, { required: true, type: 'tel' })}
            {field('Email', 'email', editForm, setEditForm, { type: 'email' })}
            {field('IC / Reg no.', 'ic', editForm, setEditForm)}
            {field('Address', 'address', editForm, setEditForm, { textarea: true })}
          </div>
        )}
      </ResponsiveModal>
    </div>
  )
}

export default CustomerDatabase
