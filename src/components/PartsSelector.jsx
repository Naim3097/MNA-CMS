import { useState } from 'react'
import { usePartsContext } from '../context/PartsContext'

const fmt = (v) => new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(Number(v) || 0)

/**
 * PartsSelector — 2026 inventory picker (no icons).
 * Lists live inventory from PartsContext with search + per-row quantity.
 * Calls onAddPart(part, quantity) for each selection; the parent maps the
 * inventory record into a line item ({ partId, sku, partName, pricePerUnit, ... }).
 *
 * `selectedParts` (optional) is the current line-item array so we can show how
 * much of each part is already on the document and reduce the "available" hint.
 */
function PartsSelector({ onAddPart, selectedParts = [] }) {
  const { parts = [], searchParts } = usePartsContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [quantities, setQuantities] = useState({})

  const displayedParts = searchQuery ? searchParts(searchQuery) : parts

  const getQty = (partId) => quantities[partId] ?? 1
  const setQty = (partId, qty) => setQuantities({ ...quantities, [partId]: Math.max(1, qty || 1) })

  // How many of this part are already on the current document.
  const alreadyOnDoc = (partId) =>
    selectedParts
      .filter((item) => item.partId === partId)
      .reduce((s, item) => s + (Number(item.quantity) || 0), 0)

  const handleAdd = (part) => {
    onAddPart(part, getQty(part.id))
    setQuantities({ ...quantities, [part.id]: 1 })
  }

  if (!parts.length) {
    return (
      <div className="card-flat text-center py-10">
        <p className="text-ink font-medium mb-1">No parts in inventory</p>
        <p className="subtle">Add parts in Parts Management first, or add a custom line below.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        className="input"
        placeholder="Search inventory by name, SKU, or supplier…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        autoFocus
      />

      <div className="space-y-2 max-h-[52vh] overflow-y-auto touch-scroll -mx-1 px-1">
        {displayedParts.length === 0 ? (
          <div className="text-center py-10 subtle">No parts match your search.</div>
        ) : (
          displayedParts.map((part) => {
            const stock = Number(part.unitStock) || 0
            const onDoc = alreadyOnDoc(part.id)
            const available = stock - onDoc
            const qty = getQty(part.id)
            const stockPill =
              stock <= 0 ? 'pill-danger' : stock <= 10 ? 'pill-warn' : 'pill-muted'

            return (
              <div
                key={part.id}
                className="rounded-2xl border border-line p-3 sm:p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink truncate">{part.namaProduk}</div>
                    <div className="text-xs text-muted truncate">
                      {part.kodProduk}
                      {part.supplier ? ` · ${part.supplier}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="nums font-medium text-ink">{fmt(part.harga)}</div>
                    <span className={`pill ${stockPill} mt-1`}>Stock: {stock}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="field-label mb-0">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(part.id, parseInt(e.target.value, 10))}
                    className="input h-10 w-20 text-center"
                  />
                  {onDoc > 0 && (
                    <span className="text-xs text-muted">
                      {onDoc} already added{available >= 0 ? ` · ${available} left` : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAdd(part)}
                    className="btn-primary btn-sm ml-auto"
                  >
                    {onDoc > 0 ? 'Add more' : 'Add'}
                  </button>
                </div>
                {available < 0 && (
                  <p className="field-hint text-warn mt-1">
                    Adding will exceed current stock (oversell allowed).
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      <p className="subtle text-center">
        Showing {displayedParts.length} of {parts.length} parts
      </p>
    </div>
  )
}

export default PartsSelector
