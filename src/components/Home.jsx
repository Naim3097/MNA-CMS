import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { usePartsContext } from '../context/PartsContext'

/**
 * Home / "Start here" landing — answers "where do I start" with the primary
 * daily actions and a small snapshot. Structure/flow only (no dashboards to build).
 */
function Home({ openInvoice, openQuotation, setActiveSection }) {
  const { parts = [] } = usePartsContext() || {}
  const [snap, setSnap] = useState({ invoices: 0, collected: 0, outstanding: 0, loading: true })

  useEffect(() => {
    ;(async () => {
      try {
        const s = await getDocs(collection(db, 'customer_invoices'))
        let invoices = 0, collected = 0, outstanding = 0
        s.forEach((d) => {
          const x = d.data()
          invoices += 1
          collected += Number(x.deposit || 0)
          if (x.paymentStatus !== 'paid') outstanding += Number(x.balanceDue || 0)
        })
        setSnap({ invoices, collected, outstanding, loading: false })
      } catch {
        setSnap((p) => ({ ...p, loading: false }))
      }
    })()
  }, [])

  const lowStock = parts.filter((p) => (Number(p.unitStock) || 0) <= 10).length
  const fmt = (v) => new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(v || 0)

  const primary = [
    { label: 'New repair invoice', desc: 'Bill a car repair job', onClick: () => openInvoice({ mode: 'repair' }), starter: true },
    { label: 'Sell parts', desc: 'Over-the-counter parts sale', onClick: () => openInvoice({ mode: 'parts' }) },
  ]
  const secondary = [
    { label: 'New quotation', desc: 'Prepare an estimate', onClick: () => openQuotation({}) },
    { label: 'Add customer', desc: 'Create a customer record', onClick: () => setActiveSection('customers') },
    { label: 'Add stock', desc: 'Add or restock inventory', onClick: () => setActiveSection('inventory') },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">What would you like to do?</h2>
        <p className="subtle mt-1">Pick an action to get started.</p>
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {primary.map((a) => (
          <button key={a.label} onClick={a.onClick} className="card text-left hover:shadow-card transition-shadow tap-clean">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-ink">{a.label}</span>
              {a.starter && <span className="pill pill-accent">Start here</span>}
            </div>
            <div className="subtle mt-1">{a.desc}</div>
          </button>
        ))}
      </div>

      {/* Secondary actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {secondary.map((a) => (
          <button key={a.label} onClick={a.onClick} className="card-flat text-left hover:shadow-soft transition-shadow tap-clean">
            <div className="font-medium text-ink">{a.label}</div>
            <div className="subtle mt-1">{a.desc}</div>
          </button>
        ))}
      </div>

      {/* Snapshot */}
      <div>
        <h3 className="section-title text-base mb-2">Today at a glance</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="stat"><div className="stat-label">Invoices</div><div className="stat-value">{snap.loading ? '—' : snap.invoices}</div></div>
          <div className="stat"><div className="stat-label">Collected</div><div className="stat-value text-lg">{snap.loading ? '—' : fmt(snap.collected)}</div></div>
          <div className="stat"><div className="stat-label">Outstanding</div><div className="stat-value text-lg">{snap.loading ? '—' : fmt(snap.outstanding)}</div></div>
          <button onClick={() => setActiveSection('inventory')} className="stat text-left tap-clean"><div className="stat-label">Low stock</div><div className={`stat-value ${lowStock > 0 ? 'text-warn' : ''}`}>{lowStock}</div></button>
        </div>
      </div>
    </div>
  )
}

export default Home
