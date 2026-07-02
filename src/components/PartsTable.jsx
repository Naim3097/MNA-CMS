import { usePartsContext } from '../context/PartsContext'
import { ResponsiveTable } from './ui'

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

function PartsTable({ parts, onEditPart }) {
  const { deletePart } = usePartsContext()

  const handleDelete = async (part) => {
    if (!window.confirm(`Permanently delete "${part.namaProduk}"? This cannot be undone.`)) return
    try {
      await deletePart(part.id)
    } catch {
      alert('Failed to delete part. Please try again.')
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
          {p.specification && (
            <div className="text-xs text-faint truncate max-w-[260px]">{p.specification}</div>
          )}
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
            className="btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              onEditPart(p)
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
    <ResponsiveTable
      columns={columns}
      data={parts}
      keyField="id"
      emptyMessage="No parts found. Add your first part to get started."
    />
  )
}

export default PartsTable
