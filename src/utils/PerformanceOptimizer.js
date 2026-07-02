/**
 * Performance Optimizer
 * Optimizes database operations, caching, and UI responsiveness
 */

// Custom debounce implementation
const debounce = (func, delay) => {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func.apply(this, args), delay)
  }
}

// Custom throttle implementation  
const throttle = (func, limit) => {
  let inThrottle
  return (...args) => {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

export class PerformanceOptimizer {

  // Cache for frequently accessed data
  static cache = new Map()
  static cacheTimestamps = new Map()
  static CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  /**
   * Debounced validation for real-time editing
   * @param {Function} validationFn - Validation function
   * @param {Number} delay - Debounce delay in milliseconds
   * @returns {Function} Debounced function
   */
  static createDebouncedValidator(validationFn, delay = 300) {
    return debounce(async (...args) => {
      try {
        const result = await validationFn(...args)
        return result
      } catch (error) {
        console.error('Validation error:', error)
        return { isValid: false, errors: [error.message] }
      }
    }, delay)
  }

  /**
   * Throttled stock checking to prevent excessive API calls
   * @param {Function} stockCheckFn - Stock check function
   * @param {Number} limit - Throttle limit in milliseconds
   * @returns {Function} Throttled function
   */
  static createThrottledStockChecker(stockCheckFn, limit = 1000) {
    return throttle(async (...args) => {
      try {
        const cacheKey = `stock_${JSON.stringify(args)}`
        
        // Check cache first
        if (this.isCacheValid(cacheKey)) {
          return this.cache.get(cacheKey)
        }

        const result = await stockCheckFn(...args)
        
        // Cache the result
        this.setCache(cacheKey, result)
        
        return result
      } catch (error) {
        console.error('Stock check error:', error)
        return { available: false, error: error.message }
      }
    }, limit)
  }

  /**
   * Batch database operations for efficiency
   * @param {Array} operations - Array of database operations
   * @param {Number} batchSize - Size of each batch
   * @returns {Promise<Array>} Results array
   */
  static async batchOperations(operations, batchSize = 10) {
    const results = []
    const startTime = performance.now()

    try {
      // Process operations in batches
      for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize)
        
        // Execute batch concurrently
        const batchPromises = batch.map(async (operation, index) => {
          try {
            const result = await operation()
            return { 
              index: i + index, 
              success: true, 
              result,
              executionTime: performance.now() - startTime
            }
          } catch (error) {
            console.error(`Batch operation ${i + index} failed:`, error)
            return { 
              index: i + index, 
              success: false, 
              error: error.message,
              executionTime: performance.now() - startTime
            }
          }
        })

        const batchResults = await Promise.allSettled(batchPromises)
        results.push(...batchResults.map(result => result.value))

        // Add small delay between batches to prevent overwhelming the database
        if (i + batchSize < operations.length) {
          await this.delay(50) // 50ms delay
        }
      }

      const totalTime = performance.now() - startTime
      console.log(`Batch operations completed: ${operations.length} operations in ${totalTime.toFixed(2)}ms`)

      return results

    } catch (error) {
      console.error('Batch operations failed:', error)
      throw error
    }
  }

  /**
   * Optimize invoice loading with selective field loading
   * @param {String} invoiceId - Invoice ID
   * @param {Array} fields - Fields to load (optional)
   * @returns {Promise<Object>} Optimized invoice data
   */
  static async loadInvoiceOptimized(invoiceId, fields = null) {
    const cacheKey = `invoice_${invoiceId}_${fields ? fields.join(',') : 'full'}`
    
    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      console.log('Loading invoice from cache:', invoiceId)
      return this.cache.get(cacheKey)
    }

    try {
      const startTime = performance.now()
      
      // In a real implementation, you would use Firebase's select() method
      // For now, we'll simulate optimized loading
      const invoice = await this.loadInvoiceWithFields(invoiceId, fields)
      
      const loadTime = performance.now() - startTime
      console.log(`Invoice loaded in ${loadTime.toFixed(2)}ms:`, invoiceId)

      // Cache the result
      this.setCache(cacheKey, invoice)
      
      return invoice

    } catch (error) {
      console.error('Optimized invoice loading failed:', error)
      throw error
    }
  }

  /**
   * Preload frequently accessed data
   * @param {Array} invoiceIds - Invoice IDs to preload
   * @returns {Promise<void>}
   */
  static async preloadInvoices(invoiceIds) {
    const uncachedIds = invoiceIds.filter(id => 
      !this.isCacheValid(`invoice_${id}_full`)
    )

    if (uncachedIds.length === 0) {
      console.log('All invoices already cached')
      return
    }

    console.log(`Preloading ${uncachedIds.length} invoices`)

    // Load invoices in batches
    const loadOperations = uncachedIds.map(invoiceId => 
      () => this.loadInvoiceOptimized(invoiceId)
    )

    await this.batchOperations(loadOperations, 5) // Smaller batch size for preloading
  }

  /**
   * Optimize parts data loading with search indexing
   * @param {String} searchTerm - Search term (optional)
   * @param {Boolean} activeOnly - Load only active parts
   * @returns {Promise<Array>} Optimized parts data
   */
  static async loadPartsOptimized(searchTerm = '', activeOnly = true) {
    const cacheKey = `parts_${searchTerm}_${activeOnly}`
    
    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      console.log('Loading parts from cache')
      return this.cache.get(cacheKey)
    }

    try {
      const startTime = performance.now()
      
      // Simulate optimized parts loading with search
      const parts = await this.loadPartsWithOptimization(searchTerm, activeOnly)
      
      const loadTime = performance.now() - startTime
      console.log(`Parts loaded in ${loadTime.toFixed(2)}ms: ${parts.length} parts`)

      // Cache the result (shorter cache duration for parts)
      this.setCache(cacheKey, parts, 2 * 60 * 1000) // 2 minutes
      
      return parts

    } catch (error) {
      console.error('Optimized parts loading failed:', error)
      throw error
    }
  }

  /**
   * Create optimized search function
   * @param {Function} searchFn - Original search function
   * @returns {Function} Optimized search function
   */
  static createOptimizedSearch(searchFn) {
    // Debounce search to avoid excessive calls
    const debouncedSearch = debounce(searchFn, 250)
    
    return async (searchTerm, ...args) => {
      // Skip search for very short terms
      if (searchTerm && searchTerm.length < 2) {
        return []
      }

      const cacheKey = `search_${searchTerm}_${JSON.stringify(args)}`
      
      // Check cache first
      if (this.isCacheValid(cacheKey)) {
        return this.cache.get(cacheKey)
      }

      try {
        const result = await debouncedSearch(searchTerm, ...args)
        
        // Cache search results (short duration)
        this.setCache(cacheKey, result, 60 * 1000) // 1 minute
        
        return result
      } catch (error) {
        console.error('Optimized search failed:', error)
        return []
      }
    }
  }

  /**
   * Optimize UI updates with requestAnimationFrame
   * @param {Function} updateFn - UI update function
   * @returns {Function} Optimized update function
   */
  static createOptimizedUIUpdate(updateFn) {
    let rafId = null
    let pendingUpdate = null

    return (...args) => {
      // Cancel previous update if still pending
      if (rafId) {
        cancelAnimationFrame(rafId)
      }

      pendingUpdate = args

      rafId = requestAnimationFrame(() => {
        try {
          updateFn(...pendingUpdate)
          rafId = null
          pendingUpdate = null
        } catch (error) {
          console.error('Optimized UI update failed:', error)
        }
      })
    }
  }

  /**
   * Memory cleanup for large datasets
   * @param {Object} dataSet - Data to cleanup
   * @returns {Object} Cleaned data
   */
  static cleanupMemory(dataSet) {
    // Remove circular references
    const cleaned = JSON.parse(JSON.stringify(dataSet))
    
    // Clear old cache entries
    this.clearExpiredCache()
    
    return cleaned
  }

  /**
   * Monitor performance metrics
   * @param {String} operation - Operation name
   * @param {Function} operationFn - Operation function
   * @returns {Promise<any>} Operation result with performance metrics
   */
  static async monitorPerformance(operation, operationFn) {
    const startTime = performance.now()
    const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0

    try {
      const result = await operationFn()
      
      const endTime = performance.now()
      const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
      
      const metrics = {
        operation,
        duration: endTime - startTime,
        memoryDelta: endMemory - startMemory,
        timestamp: new Date(),
        success: true
      }

      console.log(`Performance ${operation}:`, metrics)
      
      // Store metrics for analysis
      this.storePerformanceMetrics(metrics)
      
      return result

    } catch (error) {
      const endTime = performance.now()
      const metrics = {
        operation,
        duration: endTime - startTime,
        error: error.message,
        timestamp: new Date(),
        success: false
      }

      console.error(`Performance ${operation} failed:`, metrics)
      this.storePerformanceMetrics(metrics)
      
      throw error
    }
  }

  // Cache Management Methods

  /**
   * Set cache entry
   * @param {String} key - Cache key
   * @param {any} value - Cache value
   * @param {Number} duration - Cache duration in milliseconds
   */
  static setCache(key, value, duration = this.CACHE_DURATION) {
    this.cache.set(key, value)
    this.cacheTimestamps.set(key, Date.now() + duration)
  }

  /**
   * Check if cache entry is valid
   * @param {String} key - Cache key
   * @returns {Boolean} Is valid
   */
  static isCacheValid(key) {
    if (!this.cache.has(key)) return false
    
    const expiry = this.cacheTimestamps.get(key)
    if (Date.now() > expiry) {
      this.cache.delete(key)
      this.cacheTimestamps.delete(key)
      return false
    }
    
    return true
  }

  /**
   * Clear expired cache entries
   */
  static clearExpiredCache() {
    const now = Date.now()
    
    for (const [key, expiry] of this.cacheTimestamps) {
      if (now > expiry) {
        this.cache.delete(key)
        this.cacheTimestamps.delete(key)
      }
    }
  }

  /**
   * Clear all cache
   */
  static clearCache() {
    this.cache.clear()
    this.cacheTimestamps.clear()
    console.log('Cache cleared')
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  static getCacheStats() {
    return {
      totalEntries: this.cache.size,
      memoryUsage: this.estimateCacheMemory(),
      oldestEntry: Math.min(...Array.from(this.cacheTimestamps.values())),
      newestEntry: Math.max(...Array.from(this.cacheTimestamps.values()))
    }
  }

  // Helper Methods

  /**
   * Create delay promise
   * @param {Number} ms - Milliseconds
   * @returns {Promise}
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Estimate cache memory usage
   * @returns {Number} Estimated memory in bytes
   */
  static estimateCacheMemory() {
    let totalSize = 0
    for (const value of this.cache.values()) {
      totalSize += JSON.stringify(value).length * 2 // Rough estimate
    }
    return totalSize
  }

  /**
   * Store performance metrics (in production, send to analytics)
   * @param {Object} metrics - Performance metrics
   */
  static storePerformanceMetrics(metrics) {
    // In production, you would send this to your analytics service
    const perfLog = JSON.parse(localStorage.getItem('performance_log') || '[]')
    
    perfLog.push(metrics)
    
    // Keep only last 100 entries
    if (perfLog.length > 100) {
      perfLog.splice(0, perfLog.length - 100)
    }
    
    localStorage.setItem('performance_log', JSON.stringify(perfLog))
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance stats
   */
  static getPerformanceStats() {
    const perfLog = JSON.parse(localStorage.getItem('performance_log') || '[]')
    
    if (perfLog.length === 0) {
      return { noData: true }
    }

    const successful = perfLog.filter(m => m.success)
    const failed = perfLog.filter(m => !m.success)
    
    return {
      totalOperations: perfLog.length,
      successRate: (successful.length / perfLog.length) * 100,
      averageDuration: successful.reduce((sum, m) => sum + m.duration, 0) / successful.length,
      slowestOperation: successful.reduce((max, m) => m.duration > max.duration ? m : max),
      fastestOperation: successful.reduce((min, m) => m.duration < min.duration ? m : min),
      failureCount: failed.length,
      commonErrors: this.groupErrorsByType(failed)
    }
  }

  /**
   * Group errors by type for analysis
   * @param {Array} failedOperations - Failed operations
   * @returns {Object} Grouped errors
   */
  static groupErrorsByType(failedOperations) {
    const errorGroups = {}
    
    failedOperations.forEach(op => {
      const errorType = op.error.split(':')[0] // Get error type
      errorGroups[errorType] = (errorGroups[errorType] || 0) + 1
    })
    
    return errorGroups
  }

  // Simulated helper methods (replace with real implementations)

  /**
   * Simulated optimized invoice loading
   * @param {String} invoiceId - Invoice ID
   * @param {Array} fields - Fields to load
   * @returns {Promise<Object>} Invoice data
   */
  static async loadInvoiceWithFields(invoiceId, fields) {
    // In real implementation, use Firebase select()
    // This is just a simulation
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          id: invoiceId,
          loaded: true,
          fields: fields || 'all',
          optimized: true
        })
      }, Math.random() * 100) // Simulate network delay
    })
  }

  /**
   * Simulated optimized parts loading
   * @param {String} searchTerm - Search term
   * @param {Boolean} activeOnly - Active only
   * @returns {Promise<Array>} Parts data
   */
  static async loadPartsWithOptimization(searchTerm, activeOnly) {
    // In real implementation, use optimized Firestore queries
    return new Promise(resolve => {
      setTimeout(() => {
        const mockParts = Array.from({ length: 50 }, (_, i) => ({
          id: `part_${i}`,
          name: `Part ${i}`,
          active: activeOnly ? true : Math.random() > 0.2,
          matches: !searchTerm || `Part ${i}`.toLowerCase().includes(searchTerm.toLowerCase())
        })).filter(part => !activeOnly || part.active)
          .filter(part => !searchTerm || part.matches)

        resolve(mockParts)
      }, Math.random() * 200)
    })
  }
}

export default PerformanceOptimizer
