/**
 * Vitest Setup File
 * Global test setup and configuration
 */

import { beforeAll, afterEach, afterAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupTestEnvironment, cleanupTestEnvironment } from './testUtils'

// Setup test environment before all tests
beforeAll(() => {
  setupTestEnvironment()
})

// Cleanup after each test
afterEach(() => {
  cleanup()
  cleanupTestEnvironment()
})

// Final cleanup after all tests
afterAll(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

// Mock Firebase entirely
vi.mock('../firebaseConfig', () => ({
  db: {},
  auth: {},
  storage: {}
}))

// Mock Firestore functions
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore')
  return {
    ...actual,
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({
          exists: () => true,
          data: () => ({}),
          id: 'test-id'
        }))
      }))
    })),
    doc: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({
        exists: () => true,
        data: () => ({}),
        id: 'test-id'
      })),
      set: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve())
    })),
    getDocs: vi.fn(() => Promise.resolve({
      docs: []
    })),
    getDoc: vi.fn(() => Promise.resolve({
      exists: () => true,
      data: () => ({}),
      id: 'test-id'
    })),
    addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc-id' })),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteDoc: vi.fn(() => Promise.resolve()),
    setDoc: vi.fn(() => Promise.resolve()),
    onSnapshot: vi.fn(() => vi.fn()),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(() => Promise.resolve())
    })),
    runTransaction: vi.fn((callback) => {
      const transaction = {
        get: vi.fn(() => Promise.resolve({
          exists: () => true,
          data: () => ({}),
          id: 'test-id'
        })),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
      return Promise.resolve(callback(transaction))
    })
  }
})

// Mock React contexts
vi.mock('../contexts/InvoiceContext', () => ({
  useInvoiceContext: vi.fn(() => ({
    invoices: [],
    loading: false,
    error: null,
    updateInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    searchInvoices: vi.fn(() => []),
    calculateInvoiceStats: vi.fn(() => ({}))
  }))
}))

vi.mock('../contexts/PartsContext', () => ({
  usePartsContext: vi.fn(() => ({
    parts: [],
    loading: false,
    error: null,
    updatePartStock: vi.fn(),
    searchParts: vi.fn(() => [])
  }))
}))

// Mock PDF generation
vi.mock('../utils/PDFGenerator', () => ({
  default: {
    generateInvoicePDF: vi.fn(() => Promise.resolve())
  }
}))

// Global test utilities
global.testUtils = {
  createMockEvent: (type = 'click', options = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true, ...options })
    return event
  },

  createMockTouchEvent: (type = 'touchstart', touches = []) => {
    const event = new TouchEvent(type, {
      touches,
      bubbles: true,
      cancelable: true
    })
    return event
  },

  waitFor: (condition, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const check = () => {
        if (condition()) {
          resolve(true)
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for condition'))
        } else {
          setTimeout(check, 10)
        }
      }
      check()
    })
  }
}

// Console setup for clean test output
const originalConsole = { ...console }

global.console = {
  ...console,
  // Suppress logs in tests unless explicitly needed
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  // Keep warnings and errors visible
  warn: (...args) => {
    if (process.env.NODE_ENV === 'test' && process.env.VERBOSE_TESTS) {
      originalConsole.warn(...args)
    }
  },
  error: (...args) => {
    if (process.env.NODE_ENV === 'test' && process.env.VERBOSE_TESTS) {
      originalConsole.error(...args)
    }
  }
}

// Performance API mock
Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    memory: {
      usedJSHeapSize: 10000000,
      totalJSHeapSize: 20000000,
      jsHeapSizeLimit: 100000000
    }
  },
  writable: true
})

// Request Animation Frame mock
global.requestAnimationFrame = vi.fn((cb) => {
  setTimeout(cb, 16) // ~60fps
  return 1
})
global.cancelAnimationFrame = vi.fn()

// ResizeObserver mock
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// IntersectionObserver mock
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}))

// Clipboard API mock
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve(''))
  },
  writable: true
})

// Geolocation API mock (if needed)
Object.defineProperty(navigator, 'geolocation', {
  value: {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn()
  },
  writable: true
})

// Mock Image constructor for testing
global.Image = class MockImage {
  constructor() {
    setTimeout(() => {
      this.onload && this.onload()
    }, 100)
  }
}

// Mock URL.createObjectURL for file handling tests
global.URL.createObjectURL = vi.fn(() => 'mock-object-url')
global.URL.revokeObjectURL = vi.fn()

// Add custom matchers for better test assertions
expect.extend({
  toHaveOXHUBColors(element) {
    const style = getComputedStyle(element)
    const oxhubColors = ['#000000', '#dc2626', '#ffffff', '#f8f9fa', '#6c757d']
    
    const hasValidColor = oxhubColors.some(color =>
      style.color.includes(color) ||
      style.backgroundColor.includes(color) ||
      style.borderColor.includes(color)
    )

    return {
      message: () => `Expected element to use OXHUB color palette`,
      pass: hasValidColor,
    }
  },

  toBeTouchFriendly(element) {
    const style = getComputedStyle(element)
    const height = parseInt(style.height) || 0
    const width = parseInt(style.width) || 0
    const isTouchFriendly = height >= 44 && width >= 44

    return {
      message: () => `Expected element to be touch-friendly (min 44x44px), got ${width}x${height}px`,
      pass: isTouchFriendly,
    }
  },

  toBeAccessible(element) {
    const hasAriaLabel = element.hasAttribute('aria-label')
    const hasRole = element.hasAttribute('role')
    const hasTabIndex = element.hasAttribute('tabindex')
    const isFocusable = element.tabIndex >= 0
    const isAccessible = hasAriaLabel || hasRole || isFocusable

    return {
      message: () => `Expected element to be accessible (have aria-label, role, or be focusable)`,
      pass: isAccessible,
    }
  },

  toHavePerformanceWithin(fn, expectedDuration) {
    const startTime = performance.now()
    const result = fn()
    const endTime = performance.now()
    const actualDuration = endTime - startTime

    return {
      message: () => `Expected function to complete within ${expectedDuration}ms, took ${actualDuration}ms`,
      pass: actualDuration <= expectedDuration,
    }
  }
})

// Test environment logging
if (process.env.NODE_ENV === 'test') {
  console.info('🧪 Test environment initialized with OXHUB Invoice System mocks')
}
