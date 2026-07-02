/**
 * Conflict Resolution Modal Component
 * Provides user-friendly interface for resolving invoice edit conflicts
 */

import React, { useState, useEffect } from 'react'
import ConflictResolver from '../utils/ConflictResolver'
import { ResponsiveModal } from './ui'

const ConflictResolutionModal = ({ 
  isOpen, 
  onClose, 
  localInvoice, 
  remoteInvoice, 
  conflictAnalysis, 
  onResolutionSelected 
}) => {
  const [resolutionStrategy, setResolutionStrategy] = useState(null)
  const [manualResolutions, setManualResolutions] = useState({})
  const [showDetails, setShowDetails] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && conflictAnalysis) {
      // Generate resolution strategies
      const strategies = ConflictResolver.generateResolutionStrategies(
        conflictAnalysis,
        localInvoice,
        remoteInvoice
      )
      
      // Set recommended strategy as default
      const recommended = strategies.find(s => s.recommended)
      if (recommended) {
        setResolutionStrategy(recommended)
      }
    }
  }, [isOpen, conflictAnalysis, localInvoice, remoteInvoice])

  if (!isOpen || !conflictAnalysis) return null

  const strategies = ConflictResolver.generateResolutionStrategies(
    conflictAnalysis,
    localInvoice,
    remoteInvoice
  )

  const handleResolutionSelect = async (strategy) => {
    setLoading(true)
    
    try {
      let resolvedInvoice = null

      switch (strategy.id) {
        case 'reload':
          resolvedInvoice = remoteInvoice
          break
          
        case 'force_overwrite':
          resolvedInvoice = localInvoice
          break
          
        case 'auto_merge':
          resolvedInvoice = ConflictResolver.autoMerge(
            localInvoice,
            remoteInvoice,
            conflictAnalysis
          )
          break
          
        case 'manual_resolve':
          resolvedInvoice = await handleManualResolution()
          break
          
        default:
          throw new Error('Unknown resolution strategy')
      }

      onResolutionSelected(strategy, resolvedInvoice)

    } catch (error) {
      console.error('Resolution failed:', error)
      alert(`Resolution failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleManualResolution = () => {
    // Apply manual resolutions to create merged invoice
    let resolved = { ...remoteInvoice } // Start with remote (latest)

    // Apply manual resolutions
    for (const [conflictId, resolution] of Object.entries(manualResolutions)) {
      const conflict = conflictAnalysis.conflicts.find(c => `${c.type}_${c.partId || c.field}` === conflictId)
      
      if (conflict && resolution) {
        switch (resolution) {
          case 'use_local':
            if (conflict.field === 'items') {
              // Handle item-level conflicts
              const localItem = localInvoice.items.find(item => item.partId === conflict.partId)
              if (localItem) {
                const itemIndex = resolved.items.findIndex(item => item.partId === conflict.partId)
                if (itemIndex >= 0) {
                  resolved.items[itemIndex] = localItem
                } else {
                  resolved.items.push(localItem)
                }
              }
            } else {
              // Handle other field conflicts
              const fieldPath = conflict.field.split('.')
              let target = resolved
              for (let i = 0; i < fieldPath.length - 1; i++) {
                if (!target[fieldPath[i]]) target[fieldPath[i]] = {}
                target = target[fieldPath[i]]
              }
              target[fieldPath[fieldPath.length - 1]] = conflict.local
            }
            break
            
          case 'use_remote':
            // Remote value is already in place
            break
            
          case 'manual':
            // Custom value would be handled separately
            break
        }
      }
    }

    // Recalculate totals
    resolved.subtotal = resolved.items.reduce((sum, item) => sum + item.totalPrice, 0)
    resolved.totalAmount = resolved.subtotal
    resolved.version = (remoteInvoice.version || 1) + 1
    resolved.mergeSource = 'manual_resolution'

    return resolved
  }

  const toggleDetails = (conflictId) => {
    setShowDetails(prev => ({
      ...prev,
      [conflictId]: !prev[conflictId]
    }))
  }

  const handleManualResolutionChange = (conflictId, resolution) => {
    setManualResolutions(prev => ({
      ...prev,
      [conflictId]: resolution
    }))
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200'
      case 'high': return 'text-red-600 bg-red-50 border-red-200'
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStrategyRiskColor = (risk) => {
    switch (risk) {
      case 'high': return 'text-red-600'
      case 'medium': return 'text-yellow-600'
      case 'low': return 'text-green-600'
      default: return 'text-gray-600'
    }
  }

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={!loading}
      closeOnEsc={!loading}
      title={`Conflict — Invoice #${localInvoice?.invoiceNumber || ''}`}
      footer={
        <>
          <button
            onClick={onClose}
            className="btn-secondary w-full sm:w-auto"
            disabled={loading}
          >
            Cancel
          </button>
          {resolutionStrategy?.requiresConfirmation && (
            <span className="text-xs sm:text-sm text-primary-red text-center sm:self-center order-first sm:order-none">
              ⚠ This action cannot be undone
            </span>
          )}
          <button
            onClick={() => handleResolutionSelect(resolutionStrategy)}
            disabled={!resolutionStrategy || loading}
            className={`btn-primary w-full sm:w-auto ${!resolutionStrategy || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Resolving...' : `Apply ${resolutionStrategy?.name || 'Resolution'}`}
          </button>
        </>
      }
    >
      <div className="-mx-4 sm:-mx-6 -my-4">
        {/* Sub-header banner */}
        <div className="bg-primary-red text-white px-4 sm:px-6 py-3">
          <p className="text-sm">
            This invoice was modified by another user. Choose how to resolve.
          </p>
        </div>

        <div className="p-4 sm:p-6">
          {/* Conflict Summary */}
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Conflict Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total Conflicts:</span>
                  <span className="ml-2 font-medium text-red-600">
                    {conflictAnalysis.conflicts.length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Warnings:</span>
                  <span className="ml-2 font-medium text-yellow-600">
                    {conflictAnalysis.warnings.length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Severity:</span>
                  <span className={`ml-2 font-medium ${getSeverityColor(conflictAnalysis.severity).split(' ')[0]}`}>
                    {conflictAnalysis.severity.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Resolution Strategies */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Resolution Options</h3>
            <div className="space-y-3">
              {strategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    resolutionStrategy?.id === strategy.id
                      ? 'border-red-600 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setResolutionStrategy(strategy)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center">
                      <input
                        type="radio"
                        checked={resolutionStrategy?.id === strategy.id}
                        onChange={() => setResolutionStrategy(strategy)}
                        className="mr-3 text-red-600"
                      />
                      <div>
                        <h4 className="font-medium text-gray-900">{strategy.name}</h4>
                        {strategy.recommended && (
                          <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                            Recommended
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-sm font-medium ${getStrategyRiskColor(strategy.risk)}`}>
                      {strategy.risk} risk
                    </span>
                  </div>
                  
                  <p className="text-gray-600 text-sm mb-2">{strategy.description}</p>
                  
                  {strategy.pros && strategy.cons && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-green-600 font-medium">Pros:</span>
                        <ul className="list-disc list-inside text-gray-600 mt-1">
                          {strategy.pros.map((pro, index) => (
                            <li key={index}>{pro}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="text-red-600 font-medium">Cons:</span>
                        <ul className="list-disc list-inside text-gray-600 mt-1">
                          {strategy.cons.map((con, index) => (
                            <li key={index}>{con}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Conflicts (for manual resolution) */}
          {resolutionStrategy?.id === 'manual_resolve' && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Resolve Individual Conflicts</h3>
              <div className="space-y-3">
                {conflictAnalysis.conflicts.map((conflict) => {
                  const conflictId = `${conflict.type}_${conflict.partId || conflict.field}`
                  
                  return (
                    <div
                      key={conflictId}
                      className={`border rounded-lg p-4 ${getSeverityColor(conflict.severity)}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium">{conflict.message}</h4>
                          {conflict.partName && (
                            <p className="text-sm opacity-75">Part: {conflict.partName}</p>
                          )}
                        </div>
                        <button
                          onClick={() => toggleDetails(conflictId)}
                          className="text-sm underline opacity-75 hover:opacity-100"
                        >
                          {showDetails[conflictId] ? 'Hide Details' : 'Show Details'}
                        </button>
                      </div>

                      {showDetails[conflictId] && (
                        <div className="mt-3 p-3 bg-white rounded border">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                            <div>
                              <h5 className="font-medium text-sm">Your Value:</h5>
                              <p className="text-sm font-mono bg-gray-100 p-2 rounded">
                                {ConflictResolver.formatValue(conflict.local, conflict.type)}
                              </p>
                            </div>
                            <div>
                              <h5 className="font-medium text-sm">Other User's Value:</h5>
                              <p className="text-sm font-mono bg-gray-100 p-2 rounded">
                                {ConflictResolver.formatValue(conflict.remote, conflict.type)}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h5 className="font-medium text-sm">Choose Resolution:</h5>
                            <div className="space-y-1">
                              {conflict.resolutionOptions?.map((option) => (
                                <label key={option} className="flex items-center">
                                  <input
                                    type="radio"
                                    name={conflictId}
                                    value={option}
                                    checked={manualResolutions[conflictId] === option}
                                    onChange={(e) => handleManualResolutionChange(conflictId, e.target.value)}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">
                                    {option === 'use_local' && 'Use my value'}
                                    {option === 'use_remote' && 'Use their value'}
                                    {option === 'manual' && 'Enter custom value'}
                                    {option === 'reload' && 'Reload and start over'}
                                  </span>
                                  {option === ConflictResolver.getRecommendedAction(conflict) && (
                                    <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1 rounded">
                                      recommended
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Warnings */}
          {conflictAnalysis.warnings.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Warnings</h3>
              <div className="space-y-2">
                {conflictAnalysis.warnings.map((warning, index) => (
                  <div key={index} className={`p-3 rounded border ${getSeverityColor(warning.severity)}`}>
                    <p className="text-sm">{warning.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  )
}

export default ConflictResolutionModal
