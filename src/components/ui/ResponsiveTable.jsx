/**
 * ResponsiveTable — desktop table that flips to stacked cards on phones (<md).
 * 2026 styling. Column options: key, header, render(row,i), align, primary,
 * hideOnMobile, width, className.
 */
const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }

function getCellValue(col, row, index) {
  if (typeof col.render === 'function') return col.render(row, index)
  return row?.[col.key]
}

const ResponsiveTable = ({
  columns = [],
  data = [],
  keyField = 'id',
  onRowClick,
  emptyMessage = 'No data available',
  className = '',
  rowClassName,
  cardBreakpoint = 'md',
  mobileCardHeader,
  loading = false,
}) => {
  const tableShownBp = `${cardBreakpoint}:block`
  const cardsHiddenBp = `${cardBreakpoint}:hidden`

  if (loading) {
    return (
      <div className={`w-full ${className}`}>
        <div className="animate-pulse space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-line/60 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <div className={`w-full text-center py-12 text-muted text-sm ${className}`}>{emptyMessage}</div>
  }

  const primaryCol = columns.find((c) => c.primary) || columns[0]

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop / tablet table */}
      <div className={`hidden ${tableShownBp} w-full`}>
        <div className="overflow-x-auto touch-scroll rounded-2xl border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-black/[0.02]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted ${alignClass[col.align] || 'text-left'} ${col.width || ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr
                  key={row?.[keyField] ?? index}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  className={`border-t border-line transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-black/[0.02]' : ''
                  } ${typeof rowClassName === 'function' ? rowClassName(row, index) : rowClassName || ''}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm text-ink align-middle ${alignClass[col.align] || 'text-left'} ${col.className || ''}`}
                    >
                      {getCellValue(col, row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className={`${cardsHiddenBp} space-y-3`}>
        {data.map((row, index) => {
          const visibleCols = columns.filter((c) => !c.hideOnMobile && c !== primaryCol)
          return (
            <div
              key={row?.[keyField] ?? index}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              className={`bg-surface border border-line rounded-2xl p-4 shadow-soft ${
                onRowClick ? 'cursor-pointer active:bg-black/[0.02] tap-clean' : ''
              } ${typeof rowClassName === 'function' ? rowClassName(row, index) : rowClassName || ''}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-line">
                <div className="font-semibold text-ink break-words min-w-0 flex-1">
                  {mobileCardHeader ? mobileCardHeader(row, index) : getCellValue(primaryCol, row, index)}
                </div>
              </div>
              <dl className="space-y-2">
                {visibleCols.map((col) => {
                  const val = getCellValue(col, row, index)
                  if (val === undefined || val === null || val === '') return null
                  return (
                    <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                      <dt className="text-muted shrink-0">{col.header}</dt>
                      <dd className="text-ink text-right break-words min-w-0">{val}</dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ResponsiveTable
