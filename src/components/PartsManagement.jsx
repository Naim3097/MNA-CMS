import { useState, useMemo } from 'react'
import { usePartsContext } from '../context/PartsContext'
import { ResponsiveModal, ResponsiveTable, StatsGrid } from './ui'
import AddPartForm from './AddPartForm'
import EditPartModal from './EditPartModal'

const fmtCurrency = (v) =>
  new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(Number(v) || 0)

// Stock status pill (no icons). n = unitStock.
const StockPill = ({ stock }) => {
  const n = Number(stock) || 0
  if (n < 0) return <span className="pill pill-danger">Oversold ({n})</span>
  if (n === 0) return <span className="pill pill-danger">Out of stock</span>
  if (n <= 10) return <span className="pill pill-warn">Low ({n})</span>
  return <span className="pill pill-ok">In stock ({n})</span>
}

function PartsManagement() {
  const { parts, searchParts, deletePart, restockPart, loading } = usePartsContext()

  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingPart, setEditingPart] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'low_stock'

  // Restock modal state
  const [restockPartTarget, setRestockPartTarget] = useState(null)
  const [restockQty, setRestockQty] = useState('')
  const [restocking, setRestocking] = useState(false)

  // Filtered list
  const displayedParts = useMemo(() => {
    let list = searchParts(searchQuery)
    if (activeFilter === 'low_stock') {
      list = list.filter((p) => (Number(p.unitStock) || 0) <= 10)
    }
    return list
  }, [searchParts, searchQuery, parts, activeFilter])

  // Stats
  const stats = useMemo(() => {
    const totalProducts = parts.length
    const stockValue = parts.reduce(
      (sum, p) => sum + (parseFloat(p.harga) || 0) * (parseInt(p.unitStock) || 0),
      0
    )
    const lowStock = parts.filter((p) => {
      const n = Number(p.unitStock) || 0
      return n > 0 && n <= 10
    }).length
    const outOrOversold = parts.filter((p) => (Number(p.unitStock) || 0) <= 0).length
    return { totalProducts, stockValue, lowStock, outOrOversold }
  }, [parts])

  const handleDelete = async (part) => {
    if (!window.confirm(`Permanently delete "${part.namaProduk}"? This cannot be undone.`)) return
    try {
      await deletePart(part.id)
    } catch {
      alert('Failed to delete part. Please try again.')
    }
  }

  const openRestock = (part) => {
    setRestockPartTarget(part)
    setRestockQty('')
  }

  const handleRestock = async () => {
    const qty = parseInt(restockQty, 10)
    if (!qty || qty <= 0) {
      alert('Enter a quantity greater than zero.')
      return
    }
    setRestocking(true)
    try {
      await restockPart(restockPartTarget.id, qty)
      setRestockPartTarget(null)
      setRestockQty('')
    } catch {
      alert('Failed to restock. Please try again.')
    } finally {
      setRestocking(false)
    }
  }

  const columns = [
    {
      key: 'product',
      header: 'Product',
      primary: true,
      render: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-ink break-words">
            {p.kodProduk && <span className="text-muted nums mr-2">{p.kodProduk}</span>}
            {p.namaProduk}
          </div>
          <div className="text-xs text-muted truncate">{p.supplier || 'No supplier'}</div>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (p) => <StockPill stock={p.unitStock} />,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (p) => <span className="nums font-medium text-ink">{fmtCurrency(p.harga)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              openRestock(p)
            }}
          >
            Restock
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              setEditingPart(p)
            }}
          >
            Edit
          </button>
          <button
            className="btn-danger btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(p)
            }}
          >
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <StatsGrid
        columns={{ sm: 2, md: 4, lg: 4 }}
        stats={[
          { label: 'Total products', value: stats.totalProducts },
          { label: 'Stock value', value: fmtCurrency(stats.stockValue) },
          {
            label: 'Low stock',
            value: stats.lowStock,
            sublabel: activeFilter === 'low_stock' ? 'Filtering — tap to clear' : 'Tap to filter',
            active: activeFilter === 'low_stock',
            onClick: () => setActiveFilter(activeFilter === 'low_stock' ? 'all' : 'low_stock'),
          },
          { label: 'Out / oversold', value: stats.outOrOversold },
        ]}
      />

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
          <input
            className="input sm:max-w-xs"
            placeholder="Search by code, name, or supplier…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="btn-primary" onClick={() => setShowAddForm(true)}>
            Add part
          </button>
        </div>

        <ResponsiveTable
          columns={columns}
          data={displayedParts}
          keyField="id"
          loading={loading && parts.length === 0}
          emptyMessage={
            searchQuery
              ? 'No parts match your search.'
              : activeFilter === 'low_stock'
              ? 'No low-stock parts right now.'
              : 'No parts in inventory yet — add your first one.'
          }
        />
      </div>

      {/* Restock */}
      <ResponsiveModal
        isOpen={!!restockPartTarget}
        onClose={() => setRestockPartTarget(null)}
        title="Restock part"
        size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setRestockPartTarget(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleRestock} disabled={restocking}>
              {restocking ? 'Adding…' : 'Add stock'}
            </button>
          </>
        }
      >
        {restockPartTarget && (
          <div className="space-y-4">
            <div className="card-flat">
              <div className="font-medium text-ink break-words">
                {restockPartTarget.kodProduk && (
                  <span className="text-muted nums mr-2">{restockPartTarget.kodProduk}</span>
                )}
                {restockPartTarget.namaProduk}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted">
                Current stock:
                <StockPill stock={restockPartTarget.unitStock} />
              </div>
            </div>

            <div>
              <label className="field-label req">Quantity to add</label>
              <input
                className="input nums"
                type="number"
                min="1"
                inputMode="numeric"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="e.g. 20"
                autoFocus
              />
              <p className="field-hint">Added on top of current stock.</p>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Add / Edit */}
      {showAddForm && <AddPartForm onClose={() => setShowAddForm(false)} />}
      {editingPart && <EditPartModal part={editingPart} onClose={() => setEditingPart(null)} />}
    </div>
  )
}

export default PartsManagement
