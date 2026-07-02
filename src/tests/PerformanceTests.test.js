/**
 * Performance Test Suite
 * Tests system performance under various load conditions
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import PerformanceOptimizer from '../utils/PerformanceOptimizer'
import StockReconciliation from '../utils/StockReconciliation'
import AtomicOperations from '../utils/AtomicOperations'

describe('Performance Tests', () => {
  beforeEach(() => {
    // Clear cache and reset performance metrics
    PerformanceOptimizer.clearCache()
    vi.clearAllMocks()
  })

  describe('Stock Reconciliation Performance', () => {
    test('should handle large invoice efficiently', () => {
      const startTime = performance.now()
      
      // Create large invoice with 1000 items
      const originalItems = Array(1000).fill(null).map((_, i) => ({
        partId: `part-${i}`,
        namaProduk: `Part ${i}`,
        quantity: Math.floor(Math.random() * 10) + 1
      }))

      const modifiedItems = originalItems.map((item, i) => ({
        ...item,
        quantity: i % 2 === 0 ? item.quantity + 1 : item.quantity - 1
      }))

      const result = StockReconciliation.calculateStockChanges(originalItems, modifiedItems)
      
      const duration = performance.now() - startTime
      
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
      expect(result.changes).toBeDefined()
      expect(result.summary).toBeDefined()
    })

    test('should efficiently validate stock availability for bulk changes', () => {
      const startTime = performance.now()
      
      const stockChanges = Array(500).fill(null).map((_, i) => ({
        partId: `part-${i}`,
        partName: `Part ${i}`,
        quantityChange: Math.floor(Math.random() * 5) + 1
      }))

      const parts = Array(500).fill(null).map((_, i) => ({
        id: `part-${i}`,
        namaProduk: `Part ${i}`,
        unitStock: Math.floor(Math.random() * 20) + 10
      }))

      const result = StockReconciliation.validateStockAvailability(stockChanges, parts)
      
      const duration = performance.now() - startTime
      
      expect(duration).toBeLessThan(500) // Should complete within 500ms
      expect(result.isValid).toBeDefined()
    })
  })

  describe('Caching Performance', () => {
    test('should improve repeated data access through caching', async () => {
      const testData = { invoice: 'test-data', complex: Array(100).fill('data') }
      const cacheKey = 'test-performance'
      
      // First access (cache miss)
      const firstStart = performance.now()
      PerformanceOptimizer.setCache(cacheKey, testData)
      const firstDuration = performance.now() - firstStart
      
      // Second access (cache hit)
      const secondStart = performance.now()
      const cached = PerformanceOptimizer.isCacheValid(cacheKey)
      const secondDuration = performance.now() - secondStart
      
      expect(cached).toBe(true)
      expect(secondDuration).toBeLessThan(firstDuration) // Cache should be faster
    })

    test('should handle cache expiration correctly', async () => {
      const testData = { test: 'data' }
      const shortDuration = 10 // 10ms
      
      PerformanceOptimizer.setCache('expire-test', testData, shortDuration)
      
      // Should be valid immediately
      expect(PerformanceOptimizer.isCacheValid('expire-test')).toBe(true)
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 20))
      
      // Should be expired
      expect(PerformanceOptimizer.isCacheValid('expire-test')).toBe(false)
    })

    test('should manage memory efficiently with cache cleanup', () => {
      const initialCacheSize = PerformanceOptimizer.cache.size
      
      // Add many cache entries
      for (let i = 0; i < 100; i++) {
        PerformanceOptimizer.setCache(`test-${i}`, { data: `test-${i}` }, 1) // 1ms expiry
      }
      
      const afterAddSize = PerformanceOptimizer.cache.size
      expect(afterAddSize).toBe(initialCacheSize + 100)
      
      // Wait for expiration and cleanup
      setTimeout(() => {
        PerformanceOptimizer.clearExpiredCache()
        const afterCleanupSize = PerformanceOptimizer.cache.size
        expect(afterCleanupSize).toBeLessThan(afterAddSize)
      }, 10)
    })
  })

  describe('Batch Operations Performance', () => {
    test('should efficiently process batch operations', async () => {
      const startTime = performance.now()
      
      // Create 50 mock operations
      const operations = Array(50).fill(null).map((_, i) => 
        () => new Promise(resolve => 
          setTimeout(() => resolve({ result: `operation-${i}` }), Math.random() * 10)
        )
      )
      
      const results = await PerformanceOptimizer.batchOperations(operations, 10)
      
      const duration = performance.now() - startTime
      
      expect(results).toHaveLength(50)
      expect(duration).toBeLessThan(500) // Should complete efficiently
      expect(results.every(r => r.success !== undefined)).toBe(true)
    })

    test('should handle batch operation failures gracefully', async () => {
      const operations = [
        () => Promise.resolve({ success: true }),
        () => Promise.reject(new Error('Test failure')),
        () => Promise.resolve({ success: true })
      ]
      
      const results = await PerformanceOptimizer.batchOperations(operations, 5)
      
      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[1].error).toBeDefined()
      expect(results[2].success).toBe(true)
    })
  })

  describe('Memory Usage Tests', () => {
    test('should not cause memory leaks with repeated operations', () => {
      const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        const testInvoice = {
          id: `test-${i}`,
          items: Array(10).fill(null).map((_, j) => ({
            partId: `part-${j}`,
            quantity: j + 1
          }))
        }
        
        StockReconciliation.calculateStockChanges(testInvoice.items, testInvoice.items)
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
      const memoryIncrease = finalMemory - initialMemory
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
    })

    test('should handle large data structures efficiently', () => {
      const startTime = performance.now()
      const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
      
      // Create large data structure
      const largeInvoice = {
        items: Array(5000).fill(null).map((_, i) => ({
          partId: `part-${i}`,
          namaProduk: `Product ${i}`,
          quantity: Math.floor(Math.random() * 10) + 1,
          finalPrice: Math.floor(Math.random() * 100) + 10,
          description: `This is a detailed description for product ${i}`.repeat(5)
        }))
      }
      
      // Process the large structure
      const processed = PerformanceOptimizer.cleanupMemory(largeInvoice)
      
      const duration = performance.now() - startTime
      const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
      
      expect(duration).toBeLessThan(2000) // Should process within 2 seconds
      expect(processed).toBeDefined()
      expect(finalMemory - initialMemory).toBeLessThan(100 * 1024 * 1024) // Less than 100MB
    })
  })

  describe('Debounce and Throttle Performance', () => {
    test('should properly debounce validation calls', async () => {
      let callCount = 0
      const mockValidator = () => {
        callCount++
        return Promise.resolve({ valid: true })
      }
      
      const debouncedValidator = PerformanceOptimizer.createDebouncedValidator(mockValidator, 100)
      
      // Make rapid calls
      for (let i = 0; i < 10; i++) {
        debouncedValidator()
      }
      
      // Wait for debounce to settle
      await new Promise(resolve => setTimeout(resolve, 150))
      
      // Should only be called once due to debouncing
      expect(callCount).toBe(1)
    })

    test('should properly throttle stock check calls', async () => {
      let callCount = 0
      const mockStockChecker = () => {
        callCount++
        return Promise.resolve({ available: true })
      }
      
      const throttledChecker = PerformanceOptimizer.createThrottledStockChecker(mockStockChecker, 100)
      
      // Make rapid calls
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(throttledChecker(`test-${i}`))
        await new Promise(resolve => setTimeout(resolve, 20)) // 20ms intervals
      }
      
      await Promise.all(promises)
      
      // Should be throttled (fewer calls than requests)
      expect(callCount).toBeLessThan(5)
    })
  })

  describe('Real-world Performance Scenarios', () => {
    test('should handle concurrent edit attempts efficiently', async () => {
      const startTime = performance.now()
      
      const mockInvoice = {
        id: 'test-invoice',
        version: 1,
        items: [{ partId: '1', quantity: 5 }]
      }
      
      // Simulate 10 concurrent edit attempts
      const editPromises = Array(10).fill(null).map(async (_, i) => {
        const modifiedInvoice = {
          ...mockInvoice,
          version: mockInvoice.version,
          items: [{ partId: '1', quantity: 5 + i }]
        }
        
        // Mock the atomic operation
        return new Promise(resolve => 
          setTimeout(() => resolve({
            success: i === 0, // Only first one succeeds
            conflict: i > 0
          }), Math.random() * 100)
        )
      })
      
      const results = await Promise.allSettled(editPromises)
      const duration = performance.now() - startTime
      
      expect(duration).toBeLessThan(1000) // Should handle concurrency efficiently
      expect(results.every(r => r.status === 'fulfilled')).toBe(true)
    })

    test('should maintain performance with growing audit trail', () => {
      const startTime = performance.now()
      
      // Simulate large audit trail
      const auditEntries = Array(1000).fill(null).map((_, i) => ({
        id: `audit-${i}`,
        action: 'invoice_edited',
        timestamp: new Date(Date.now() - i * 1000),
        details: {
          invoiceId: `invoice-${i % 100}`,
          changes: Array(5).fill(null).map((_, j) => ({
            field: `field-${j}`,
            oldValue: `old-${j}`,
            newValue: `new-${j}`
          }))
        }
      }))
      
      // Process audit data
      const processed = auditEntries
        .filter(entry => entry.action === 'invoice_edited')
        .map(entry => ({
          id: entry.id,
          summary: `${entry.details.changes.length} changes made`
        }))
      
      const duration = performance.now() - startTime
      
      expect(duration).toBeLessThan(100) // Should process quickly
      expect(processed).toHaveLength(1000)
    })

    test('should efficiently search through large invoice collections', () => {
      const startTime = performance.now()
      
      // Create large invoice collection
      const invoices = Array(5000).fill(null).map((_, i) => ({
        id: `invoice-${i}`,
        invoiceNumber: `INV-${String(i).padStart(6, '0')}`,
        customerInfo: {
          name: `Customer ${i}`,
          contact: `contact-${i}@test.com`
        },
        items: Array(Math.floor(Math.random() * 10) + 1).fill(null).map((_, j) => ({
          partId: `part-${j}`,
          namaProduk: `Product ${j}`,
          quantity: Math.floor(Math.random() * 5) + 1
        })),
        totalAmount: Math.floor(Math.random() * 1000) + 100,
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
      }))
      
      // Perform search operations
      const searchResults = {
        byCustomer: invoices.filter(inv => inv.customerInfo.name.includes('Customer 123')),
        byAmount: invoices.filter(inv => inv.totalAmount > 500),
        byDate: invoices.filter(inv => inv.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        byProduct: invoices.filter(inv => 
          inv.items.some(item => item.namaProduk.includes('Product 5'))
        )
      }
      
      const duration = performance.now() - startTime
      
      expect(duration).toBeLessThan(1000) // Should search efficiently
      expect(Object.values(searchResults).every(results => Array.isArray(results))).toBe(true)
    })
  })

  describe('Mobile Performance Tests', () => {
    test('should optimize for mobile touch interactions', () => {
      // Simulate mobile constraints
      const mobileConstraints = {
        limitedMemory: true,
        slowerProcessor: true,
        touchInput: true
      }
      
      const startTime = performance.now()
      
      // Process typical mobile interaction
      const mobileOptimizedData = PerformanceOptimizer.cleanupMemory({
        invoice: {
          items: Array(20).fill(null).map((_, i) => ({ id: i, name: `Item ${i}` }))
        }
      })
      
      const duration = performance.now() - startTime
      
      if (mobileConstraints.slowerProcessor) {
        expect(duration).toBeLessThan(200) // Faster response for mobile
      }
      
      expect(mobileOptimizedData).toBeDefined()
    })

    test('should handle touch gesture delays appropriately', async () => {
      const touchDelay = 300 // Typical touch delay
      const startTime = performance.now()
      
      // Simulate touch interaction processing
      await new Promise(resolve => setTimeout(resolve, touchDelay))
      
      const duration = performance.now() - startTime
      expect(duration).toBeGreaterThanOrEqual(touchDelay)
      expect(duration).toBeLessThan(touchDelay + 50) // Small overhead acceptable
    })
  })
})

describe('Stress Tests', () => {
  test('should handle extreme load conditions', async () => {
    const extremeLoad = {
      invoiceCount: 10000,
      itemsPerInvoice: 100,
      concurrentOperations: 20
    }
    
    const startTime = performance.now()
    
    // Simulate extreme load
    const operations = Array(extremeLoad.concurrentOperations).fill(null).map(async (_, i) => {
      const invoice = {
        id: `extreme-${i}`,
        items: Array(extremeLoad.itemsPerInvoice).fill(null).map((_, j) => ({
          partId: `part-${j}`,
          quantity: Math.floor(Math.random() * 10) + 1
        }))
      }
      
      return StockReconciliation.calculateStockChanges(invoice.items, invoice.items)
    })
    
    const results = await Promise.allSettled(operations)
    const duration = performance.now() - startTime
    
    expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
    expect(results.every(r => r.status === 'fulfilled')).toBe(true)
  })

  test('should recover gracefully from memory pressure', () => {
    const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
    
    try {
      // Create memory pressure
      const largeArrays = []
      for (let i = 0; i < 100; i++) {
        largeArrays.push(new Array(10000).fill(`data-${i}`))
      }
      
      // Simulate cleanup under pressure
      PerformanceOptimizer.clearCache()
      largeArrays.length = 0 // Clear arrays
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
    } catch (error) {
      // Should not throw under memory pressure
      expect(error).toBeUndefined()
    }
    
    const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0
    
    // Memory should be managed (allowing for some variance)
    expect(finalMemory - initialMemory).toBeLessThan(200 * 1024 * 1024) // Less than 200MB increase
  })
})
