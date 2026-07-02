/**
 * Stock Change Summary Component
 * Visual summary of stock impact during invoice editing
 */

import { useState } from 'react'

function StockChangeSummary({ analysis }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!analysis || !analysis.differences) {
    return null
  }

  const { differences, stockImpact, validation, summary } = analysis

  // Get impact color based on change type
  const getImpactColor = (change) => {
    if (change > 0) return 'text-green-600' // Stock increase
    if (change < 0) return 'text-primary-red' // Stock decrease
    return 'text-black-75' // No change
  }

  const getImpactIcon = (change) => {
    if (change > 0) return '↗️' // Stock increase
    if (change < 0) return '↘️' // Stock decrease
    return '➡️' // No change
  }

  const totalStockChanges = Array.from(stockImpact.values()).reduce((sum, change) => sum + Math.abs(change), 0)

  return (
    <div className="border border-black-25 rounded-md p-4 bg-black-5">
      <div className="flex items-center justify-between mb-3">
        <h5 className="font-medium text-primary-black flex items-center gap-2">
          📦 Stock Impact Summary
          {validation.errors.length > 0 && (
            <span className="text-primary-red text-xs bg-red-50 px-2 py-1 rounded">
              {validation.errors.length} Error{validation.errors.length !== 1 ? 's' : ''}
            </span>
          )}
          {validation.warnings.length > 0 && (
            <span className="text-yellow-600 text-xs bg-yellow-50 px-2 py-1 rounded">
              {validation.warnings.length} Warning{validation.warnings.length !== 1 ? 's' : ''}
            </span>
          )}
        </h5>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-black-75 hover:text-primary-black px-2 py-1 rounded hover:bg-black-10"
        >
          {isExpanded ? '🔼 Less' : '🔽 More'}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
        <div className="text-center p-2 bg-primary-white rounded">
          <div className="font-semibold text-primary-black">{summary.totalPartsAdded}</div>
          <div className="text-black-75 text-xs">Added</div>
        </div>
        <div className="text-center p-2 bg-primary-white rounded">
          <div className="font-semibold text-primary-black">{summary.totalPartsRemoved}</div>
          <div className="text-black-75 text-xs">Removed</div>
        </div>
        <div className="text-center p-2 bg-primary-white rounded">
          <div className="font-semibold text-primary-black">{summary.totalPartsModified}</div>
          <div className="text-black-75 text-xs">Modified</div>
        </div>
        <div className="text-center p-2 bg-primary-white rounded">
          <div className="font-semibold text-primary-black">{totalStockChanges}</div>
          <div className="text-black-75 text-xs">Net Changes</div>
        </div>
      </div>

      {/* Validation Errors */}
      {validation.errors.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium text-primary-red mb-2">⚠️ Stock Issues:</div>
          <div className="space-y-2">
            {validation.errors.slice(0, isExpanded ? undefined : 3).map((error, index) => (
              <div key={index} className="bg-red-50 border border-primary-red rounded p-2 text-sm">
                <div className="font-medium text-primary-red">{error.message}</div>
                {error.context && (
                  <div className="text-black-75 mt-1">
                    {error.context.partName && `Part: ${error.context.partName}`}
                    {error.context.required && error.context.available && (
                      <span className="ml-2">
                        Need: {error.context.required}, Available: {error.context.available}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!isExpanded && validation.errors.length > 3 && (
              <div className="text-xs text-black-75">
                +{validation.errors.length - 3} more error{validation.errors.length - 3 !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="space-y-4">
          {/* Additions */}
          {differences.additions.length > 0 && (
            <div>
              <div className="text-sm font-medium text-primary-black mb-2">➕ Parts Added:</div>
              <div className="space-y-1">
                {differences.additions.map((addition, index) => (
                  <div key={index} className="flex justify-between items-center bg-primary-white rounded p-2 text-sm">
                    <div>
                      <span className="font-medium">{addition.item.namaProduk}</span>
                      <span className="text-black-75 ml-2">×{addition.item.quantity}</span>
                    </div>
                    <div className={`font-medium ${getImpactColor(addition.stockChange.netChange)}`}>
                      {getImpactIcon(addition.stockChange.netChange)} {Math.abs(addition.stockChange.netChange)} stock
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Removals */}
          {differences.removals.length > 0 && (
            <div>
              <div className="text-sm font-medium text-primary-black mb-2">➖ Parts Removed:</div>
              <div className="space-y-1">
                {differences.removals.map((removal, index) => (
                  <div key={index} className="flex justify-between items-center bg-primary-white rounded p-2 text-sm">
                    <div>
                      <span className="font-medium">{removal.item.namaProduk}</span>
                      <span className="text-black-75 ml-2">×{removal.item.quantity}</span>
                    </div>
                    <div className={`font-medium ${getImpactColor(removal.stockChange.netChange)}`}>
                      {getImpactIcon(removal.stockChange.netChange)} +{Math.abs(removal.stockChange.netChange)} stock
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modifications */}
          {differences.modifications.length > 0 && (
            <div>
              <div className="text-sm font-medium text-primary-black mb-2">🔄 Parts Modified:</div>
              <div className="space-y-1">
                {differences.modifications.map((modification, index) => (
                  <div key={index} className="bg-primary-white rounded p-2 text-sm">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">{modification.newItem.namaProduk}</span>
                        <span className="text-black-75 ml-2">
                          {modification.originalItem.quantity} → {modification.newItem.quantity}
                        </span>
                      </div>
                      <div className={`font-medium ${getImpactColor(modification.stockChange.netChange)}`}>
                        {getImpactIcon(modification.stockChange.netChange)} {Math.abs(modification.stockChange.netChange)} stock
                      </div>
                    </div>
                    {modification.changes.price && (
                      <div className="text-xs text-black-75 mt-1">
                        Price: RM {modification.originalItem.finalPrice?.toFixed(2)} → RM {modification.newItem.finalPrice?.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Net Stock Impact */}
          {stockImpact.size > 0 && (
            <div>
              <div className="text-sm font-medium text-primary-black mb-2">📊 Net Stock Changes:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Array.from(stockImpact.entries()).map(([partId, change]) => {
                  const part = [...differences.additions, ...differences.removals, ...differences.modifications]
                    .find(diff => diff.partId === partId || diff.item?.partId === partId || diff.newItem?.partId === partId)

                  const partName = part?.item?.namaProduk || part?.newItem?.namaProduk || `Part ${partId}`

                  return (
                    <div key={partId} className="flex justify-between items-center bg-primary-white rounded p-2 text-sm">
                      <span className="font-medium truncate">{partName}</span>
                      <span className={`font-medium ${getImpactColor(change)}`}>
                        {change > 0 ? '+' : ''}{change}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div>
              <div className="text-sm font-medium text-yellow-600 mb-2">⚠️ Warnings:</div>
              <div className="space-y-1">
                {validation.warnings.map((warning, index) => (
                  <div key={index} className="bg-yellow-50 border border-yellow-400 rounded p-2 text-sm">
                    <div className="text-yellow-800">{warning.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Summary */}
      <div className="mt-4 pt-3 border-t border-black-25 text-xs text-black-75">
        {validation.isValid ? (
          <div className="text-green-600 font-medium">✅ All stock changes are valid</div>
        ) : (
          <div className="text-primary-red font-medium">❌ Stock validation failed - fix errors above</div>
        )}
      </div>
    </div>
  )
}

export default StockChangeSummary
