import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../firebaseConfig'
import { ResponsiveModal, ResponsiveTable, StatsGrid } from './ui'

const fmtCurrency = (v) =>
  new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(Number(v) || 0)
const fmtDate = (d) => {
  const dt = d?.toDate?.() ?? (d ? new Date(d) : null)
  return dt instanceof Date && !isNaN(dt)
    ? dt.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'
}

const TIMEFRAMES = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
]

function MechanicCommissionDashboard() {
  const [mechanicCommissions, setMechanicCommissions] = useState([])
  const [selectedTimeframe, setSelectedTimeframe] = useState('month')
  const [selectedMechanic, setSelectedMechanic] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [mechanicList, setMechanicList] = useState([])
  const [commissionDetails, setCommissionDetails] = useState([])
  const [detailMechanicName, setDetailMechanicName] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  // Shop revenue counted ONCE per unique invoice in range (not per-mechanic sum)
  const [shopRevenue, setShopRevenue] = useState(0)

  useEffect(() => {
    loadMechanicCommissions()
  }, [selectedTimeframe, selectedMechanic])

  const getDateRange = (timeframe) => {
    const now = new Date()
    let startDate
    const endDate = new Date()
    switch (timeframe) {
      case 'week':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
        break
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'quarter': {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3
        startDate = new Date(now.getFullYear(), quarterStart, 1)
        break
      }
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1)
        break
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    }
    return { startDate, endDate }
  }

  const loadMechanicCommissions = async () => {
    setIsLoading(true)
    try {
      const { startDate, endDate } = getDateRange(selectedTimeframe)
      const invoicesRef = collection(db, 'customer_invoices')
      const invoicesQuery = query(invoicesRef, orderBy('dateCreated', 'desc'))
      const invoicesSnapshot = await getDocs(invoicesQuery)

      const allInvoices = invoicesSnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        dateCreated: d.data().dateCreated?.toDate?.() || new Date(d.data().dateCreated),
      }))

      const invoices = allInvoices.filter((invoice) => {
        const invoiceDate = new Date(invoice.dateCreated)
        return !isNaN(invoiceDate) && invoiceDate >= startDate && invoiceDate <= endDate
      })

      const mechanicData = calculateMechanicCommissions(invoices)

      const mechanics = [...new Set(invoices.map((invoice) => invoice.mechanicName).filter(Boolean))]
      setMechanicList(mechanics)

      const filteredData =
        selectedMechanic === 'all' ? mechanicData : mechanicData.filter((m) => m.name === selectedMechanic)

      // Shop revenue: each invoice counted ONCE across the unique set represented in the
      // filtered mechanic data (avoids double-counting multi-mechanic invoices).
      const seen = new Set()
      let revenue = 0
      filteredData.forEach((m) => {
        m.invoices.forEach((inv) => {
          if (inv.id && seen.has(inv.id)) return
          if (inv.id) seen.add(inv.id)
          revenue += Number(inv.total) || 0
        })
      })
      setShopRevenue(revenue)
      setMechanicCommissions(filteredData)
    } catch (error) {
      console.error('Error loading mechanic commissions:', error)
      setMechanicCommissions([])
      setShopRevenue(0)
    }
    setIsLoading(false)
  }

  const makeGroup = (id, name) => ({
    id,
    name,
    invoices: [],
    totalRevenue: 0,
    totalCommission: 0,
    paidInvoiceCommission: 0, // commission on invoices whose payment status is 'paid'
    unpaidInvoiceCommission: 0, // commission on invoices not yet fully paid
    invoiceCount: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    individualCommissions: 0,
    teamCommissions: 0,
    partsTotal: 0,
    laborTotal: 0,
    hasPartsData: false,
    hasLaborData: false,
    teamInvoices: 0,
  })

  // Accumulate parts/labour using the fields the invoice builder actually writes:
  // invoice.partsTotal and invoice.laborTotal. Track presence so absent -> '—'.
  const addPartsLabour = (group, invoice, factor = 1) => {
    if (invoice.partsTotal !== undefined && invoice.partsTotal !== null) {
      group.partsTotal += (Number(invoice.partsTotal) || 0) * factor
      group.hasPartsData = true
    }
    if (invoice.laborTotal !== undefined && invoice.laborTotal !== null) {
      group.laborTotal += (Number(invoice.laborTotal) || 0) * factor
      group.hasLaborData = true
    }
  }

  const calculateMechanicCommissions = (invoices) => {
    const mechanicGroups = {}

    invoices.forEach((invoice) => {
      const isPaid = invoice.paymentStatus === 'paid'

      // ---- STRATEGY 1: Commission 2.0 (mechanics array) ----
      if (invoice.mechanics && Array.isArray(invoice.mechanics) && invoice.mechanics.length > 0) {
        invoice.mechanics.forEach((m) => {
          const mechanicName = m.name || 'Unknown'
          const mechanicId = m.id || 'unknown'
          const memberCommission = Number(m.commissionAmount) || 0

          if (!mechanicGroups[mechanicName]) mechanicGroups[mechanicName] = makeGroup(mechanicId, mechanicName)
          const g = mechanicGroups[mechanicName]

          g.invoices.push({ ...invoice, memberCommission, isTeamInvoice: invoice.mechanics.length > 1 })
          g.totalCommission += memberCommission
          g.individualCommissions += memberCommission
          g.totalRevenue += Number(invoice.total) || 0
          addPartsLabour(g, invoice)
          g.invoiceCount += 1
          if (invoice.mechanics.length > 1) g.teamInvoices += 1

          if (isPaid) {
            g.paidInvoices += 1
            g.paidInvoiceCommission += memberCommission
          } else {
            g.pendingInvoices += 1
            g.unpaidInvoiceCommission += memberCommission
          }
        })
        return
      }

      // ---- STRATEGY 2: Legacy team distribution ----
      const commissionAmount = Number(invoice.commissionAmount) || 0
      const distributionType = invoice.commissionDistributionType || 'individual'

      if (distributionType === 'team' && invoice.commissionDistribution?.teamMembers) {
        invoice.commissionDistribution.teamMembers.forEach((member) => {
          const mechanicName = member.mechanicName || 'Unknown'
          const mechanicId = member.mechanicId || 'unknown'
          const pct = Number(member.percentage) || 0
          const memberCommission = (commissionAmount * pct) / 100

          if (!mechanicGroups[mechanicName]) mechanicGroups[mechanicName] = makeGroup(mechanicId, mechanicName)
          const g = mechanicGroups[mechanicName]

          g.invoices.push({ ...invoice, memberCommission, memberPercentage: pct, isTeamInvoice: true })
          g.totalRevenue += (Number(invoice.total) || 0) * (pct / 100)
          g.totalCommission += memberCommission
          g.teamCommissions += memberCommission
          addPartsLabour(g, invoice, pct / 100)
          g.teamInvoices += 1
          g.invoiceCount += 1

          if (isPaid) {
            g.paidInvoices += 1
            g.paidInvoiceCommission += memberCommission
          } else {
            g.pendingInvoices += 1
            g.unpaidInvoiceCommission += memberCommission
          }
        })
        return
      }

      // ---- STRATEGY 3: Legacy individual ----
      const mechanicName = invoice.mechanicName || 'Unknown'
      if (!invoice.mechanicName && !invoice.mechanics) return // zombie invoice
      const mechanicId = invoice.mechanicId || 'unknown'

      if (!mechanicGroups[mechanicName]) mechanicGroups[mechanicName] = makeGroup(mechanicId, mechanicName)
      const g = mechanicGroups[mechanicName]

      g.invoices.push({ ...invoice, isTeamInvoice: false })
      g.totalRevenue += Number(invoice.total) || 0
      g.totalCommission += commissionAmount
      g.individualCommissions += commissionAmount
      addPartsLabour(g, invoice)
      g.invoiceCount += 1

      if (isPaid) {
        g.paidInvoices += 1
        g.paidInvoiceCommission += commissionAmount
      } else {
        g.pendingInvoices += 1
        g.unpaidInvoiceCommission += commissionAmount
      }
    })

    return Object.values(mechanicGroups)
  }

  const showMechanicDetails = (mechanic) => {
    setCommissionDetails(mechanic.invoices)
    setDetailMechanicName(mechanic.name)
    setShowDetails(true)
  }

  const getTotalCommissions = () => mechanicCommissions.reduce((sum, m) => sum + m.totalCommission, 0)
  const getPaidInvoiceCommissions = () => mechanicCommissions.reduce((sum, m) => sum + m.paidInvoiceCommission, 0)
  const getUnpaidInvoiceCommissions = () => mechanicCommissions.reduce((sum, m) => sum + m.unpaidInvoiceCommission, 0)

  const columns = [
    {
      key: 'name',
      header: 'Mechanic',
      primary: true,
      render: (m) => (
        <div>
          <div className="font-medium text-ink">{m.name}</div>
          <div className="text-xs text-muted">{m.invoiceCount} job{m.invoiceCount === 1 ? '' : 's'}</div>
        </div>
      ),
    },
    {
      key: 'invoices',
      header: 'Invoices',
      render: (m) => (
        <div className="text-sm">
          <div className="text-ink">{m.invoiceCount} total</div>
          <div className="text-xs text-ok">{m.paidInvoices} paid</div>
          <div className="text-xs text-warn">{m.pendingInvoices} unpaid</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Commission split',
      render: (m) => (
        <div className="flex flex-wrap gap-1">
          {m.individualCommissions > 0 && (
            <span className="pill pill-muted">Individual {fmtCurrency(m.individualCommissions)}</span>
          )}
          {m.teamCommissions > 0 && <span className="pill pill-accent">Team {fmtCurrency(m.teamCommissions)}</span>}
          {m.individualCommissions <= 0 && m.teamCommissions <= 0 && <span className="text-muted">—</span>}
        </div>
      ),
    },
    {
      key: 'parts',
      header: 'Parts',
      align: 'right',
      render: (m) => <span className="nums">{m.hasPartsData ? fmtCurrency(m.partsTotal) : '—'}</span>,
    },
    {
      key: 'labour',
      header: 'Labour',
      align: 'right',
      render: (m) => <span className="nums">{m.hasLaborData ? fmtCurrency(m.laborTotal) : '—'}</span>,
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      render: (m) => (
        <div className="text-right">
          <div className="nums font-semibold text-accent">{fmtCurrency(m.totalCommission)}</div>
          <div className="text-xs text-muted nums">On paid: {fmtCurrency(m.paidInvoiceCommission)}</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <button
          className="btn-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation()
            showMechanicDetails(m)
          }}
        >
          Details
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="page-title">Mechanic commissions</h2>
          <p className="subtle">Track mechanic performance and commission earned per period.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="input select sm:w-auto"
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className="input select sm:w-auto"
            value={selectedMechanic}
            onChange={(e) => setSelectedMechanic(e.target.value)}
          >
            <option value="all">All mechanics</option>
            {mechanicList.map((mechanic) => (
              <option key={mechanic} value={mechanic}>
                {mechanic}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <StatsGrid
        columns={{ sm: 2, md: 3, lg: 5 }}
        stats={[
          { label: 'Total commissions', value: fmtCurrency(getTotalCommissions()), sublabel: 'All invoices in range' },
          { label: 'On paid invoices', value: fmtCurrency(getPaidInvoiceCommissions()), sublabel: 'Invoice marked paid' },
          { label: 'On unpaid invoices', value: fmtCurrency(getUnpaidInvoiceCommissions()), sublabel: 'Invoice not yet paid' },
          { label: 'Total revenue', value: fmtCurrency(shopRevenue), sublabel: 'Each invoice once' },
          { label: 'Active mechanics', value: mechanicCommissions.length, sublabel: 'With jobs in range' },
        ]}
      />

      {/* Breakdown table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title text-base">Commission breakdown</h3>
        </div>
        <ResponsiveTable
          columns={columns}
          data={mechanicCommissions}
          keyField="name"
          loading={isLoading}
          emptyMessage="No commission data found for the selected period."
        />
      </div>

      {/* Details modal */}
      <ResponsiveModal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title={detailMechanicName ? `${detailMechanicName} — commission details` : 'Commission details'}
        size="xl"
        footer={
          <button className="btn-primary" onClick={() => setShowDetails(false)}>
            Close
          </button>
        }
      >
        <ResponsiveTable
          keyField="id"
          data={commissionDetails}
          emptyMessage="No invoices for this mechanic."
          columns={[
            {
              key: 'invoiceNumber',
              header: 'Invoice',
              primary: true,
              render: (inv) => (
                <div>
                  <div className="font-medium text-ink">{inv.invoiceNumber || '—'}</div>
                  <div className="text-xs text-muted">{fmtDate(inv.dateCreated)}</div>
                </div>
              ),
            },
            { key: 'customerName', header: 'Customer', render: (inv) => inv.customerName || '—' },
            {
              key: 'total',
              header: 'Total',
              align: 'right',
              render: (inv) => <span className="nums">{fmtCurrency(inv.total)}</span>,
            },
            {
              key: 'commission',
              header: 'Commission',
              align: 'right',
              render: (inv) => (
                <span className="nums font-semibold text-accent">
                  {fmtCurrency(inv.memberCommission ?? inv.commissionAmount ?? 0)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Invoice status',
              render: (inv) => {
                const s = inv.paymentStatus || 'pending'
                const cls = s === 'paid' ? 'pill-ok' : s === 'overdue' ? 'pill-danger' : 'pill-warn'
                return <span className={`pill ${cls}`}>{s.replace('-', ' ')}</span>
              },
            },
          ]}
        />
      </ResponsiveModal>
    </div>
  )
}

export default MechanicCommissionDashboard
