/**
 * Test Utilities and Helpers
 * Common testing utilities for the invoice editing system
 */

// Mock Data Generators
export const createMockInvoice = (overrides = {}) => ({
  id: 'test-invoice-1',
  invoiceNumber: 'INV-001',
  version: 1,
  customerInfo: {
    name: 'Test Customer',
    contact: '123-456-7890',
    address: '123 Test Street, Test City'
  },
  items: [
    {
      partId: '1',
      namaProduk: 'Brake Pad',
      quantity: 2,
      finalPrice: 50.00,
      totalPrice: 100.00
    },
    {
      partId: '2', 
      namaProduk: 'Oil Filter',
      quantity: 1,
      finalPrice: 25.00,
      totalPrice: 25.00
    }
  ],
  subtotal: 125.00,
  totalAmount: 125.00,
  dateCreated: new Date('2025-01-01'),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  notes: 'Test invoice notes',
  ...overrides
})

export const createMockParts = () => [
  {
    id: '1',
    namaProduk: 'Brake Pad',
    unitStock: 10,
    sellPrice: 50.00,
    kategori: 'Brake System'
  },
  {
    id: '2',
    namaProduk: 'Oil Filter',
    unitStock: 5,
    sellPrice: 25.00,
    kategori: 'Engine'
  },
  {
    id: '3',
    namaProduk: 'Air Filter',
    unitStock: 8,
    sellPrice: 30.00,
    kategori: 'Engine'
  },
  {
    id: '4',
    namaProduk: 'Spark Plug',
    unitStock: 20,
    sellPrice: 15.00,
    kategori: 'Ignition'
  }
]

export const createMockStockChanges = () => [
  {
    partId: '1',
    partName: 'Brake Pad',
    quantityBefore: 10,
    quantityAfter: 8,
    quantityChange: -2,
    operation: 'allocate'
  },
  {
    partId: '2',
    partName: 'Oil Filter', 
    quantityBefore: 5,
    quantityAfter: 4,
    quantityChange: -1,
    operation: 'allocate'
  }
]

export const createMockConflictAnalysis = () => ({
  hasConflicts: true,
  hasWarnings: false,
  conflicts: [
    {
      type: 'quantity_conflict',
      field: 'items',
      partId: '1',
      partName: 'Brake Pad',
      local: 3,
      remote: 5,
      message: 'Quantity conflict for Brake Pad',
      severity: 'high',
      resolutionOptions: ['use_local', 'use_remote', 'manual']
    }
  ],
  warnings: [],
  severity: 'high',
  resolutionRequired: true
})

export const createMockAuditEntry = (overrides = {}) => ({
  id: 'audit-1',
  action: 'invoice_edit_completed',
  category: 'invoice_editing',
  invoiceId: 'test-invoice-1',
  invoiceNumber: 'INV-001',
  timestamp: new Date(),
  sessionId: 'session-123',
  operationId: 'op-456',
  details: {
    originalVersion: 1,
    newVersion: 2,
    changesApplied: {
      customerInfo: false,
      items: true,
      notes: false,
      totalChanges: 1
    }
  },
  ...overrides
})

// Test Environment Setup
export const setupTestEnvironment = () => {
  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }

  // Mock performance API
  global.performance = {
    ...performance,
    now: vi.fn(() => Date.now()),
    memory: {
      usedJSHeapSize: 10000000,
      totalJSHeapSize: 20000000,
      jsHeapSizeLimit: 100000000
    }
  }

  // Mock localStorage
  global.localStorage = {
    getItem: vi.fn((key) => {
      const store = {
        'performance_log': JSON.stringify([]),
        'audit_session_id': 'test-session-123'
      }
      return store[key] || null
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }

  // Mock sessionStorage
  global.sessionStorage = {
    getItem: vi.fn((key) => {
      const store = {
        'edit_start_time': Date.now().toString(),
        'audit_session_id': 'test-session-123'
      }
      return store[key] || null
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }

  // Mock window.matchMedia for responsive tests
  global.matchMedia = vi.fn((query) => ({
    matches: query.includes('min-width: 768px'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))
}

// Firebase Mocking Utilities
export const createMockFirestore = () => ({
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({
        exists: () => true,
        data: () => createMockInvoice(),
        id: 'test-invoice-1'
      })),
      set: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve())
    })),
    add: vi.fn(() => Promise.resolve({ id: 'new-doc-id' })),
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({
            docs: [
              {
                id: 'test-invoice-1',
                data: () => createMockInvoice()
              }
            ]
          }))
        }))
      }))
    }))
  })),
  doc: vi.fn(() => ({
    get: vi.fn(() => Promise.resolve({
      exists: () => true,
      data: () => createMockInvoice(),
      id: 'test-invoice-1'
    })),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve())
  })),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(() => Promise.resolve())
  })),
  runTransaction: vi.fn((updateFunction) => {
    const transaction = {
      get: vi.fn(() => Promise.resolve({
        exists: () => true,
        data: () => createMockInvoice(),
        id: 'test-invoice-1'
      })),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
    return updateFunction(transaction)
  })
})

// Context Providers for Testing
export const MockInvoiceContextProvider = ({ children, value = {} }) => {
  const defaultValue = {
    invoices: [createMockInvoice()],
    parts: createMockParts(),
    loading: false,
    error: null,
    searchInvoices: vi.fn((query) => [createMockInvoice()]),
    calculateInvoiceStats: vi.fn(() => ({
      totalInvoices: 1,
      totalAmount: 125.00,
      averageAmount: 125.00
    })),
    updateInvoice: vi.fn(() => Promise.resolve()),
    deleteInvoice: vi.fn(() => Promise.resolve()),
    isInvoiceBeingEdited: vi.fn(() => false),
    ...value
  }

  return React.createElement(
    'div',
    { 'data-testid': 'mock-invoice-context' },
    children
  )
}

export const MockPartsContextProvider = ({ children, value = {} }) => {
  const defaultValue = {
    parts: createMockParts(),
    loading: false,
    error: null,
    updatePartStock: vi.fn(() => Promise.resolve()),
    searchParts: vi.fn((query) => createMockParts()),
    ...value
  }

  return React.createElement(
    'div',
    { 'data-testid': 'mock-parts-context' },
    children
  )
}

// Custom Render Function with Providers
export const renderWithProviders = (ui, options = {}) => {
  const {
    invoiceContextValue = {},
    partsContextValue = {},
    ...renderOptions
  } = options

  const Wrapper = ({ children }) => {
    return React.createElement(
      MockInvoiceContextProvider,
      { value: invoiceContextValue },
      React.createElement(
        MockPartsContextProvider,
        { value: partsContextValue },
        children
      )
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// Assertion Helpers
export const expectToHaveOXHUBStyling = (element) => {
  const style = getComputedStyle(element)
  
  // Should use OXHUB color palette
  const validColors = ['#000000', '#dc2626', '#ffffff', '#f8f9fa', '#6c757d']
  const hasValidColor = validColors.some(color => 
    style.color.includes(color) || 
    style.backgroundColor.includes(color) ||
    style.borderColor.includes(color)
  )
  
  expect(hasValidColor).toBe(true)
}

export const expectToHaveTouchTarget = (element) => {
  const style = getComputedStyle(element)
  const height = parseInt(style.height)
  const width = parseInt(style.width)
  
  expect(height).toBeGreaterThanOrEqual(44)
  expect(width).toBeGreaterThanOrEqual(44)
}

export const expectToBeAccessible = (element) => {
  // Check for basic accessibility attributes
  const hasAriaLabel = element.hasAttribute('aria-label')
  const hasRole = element.hasAttribute('role')
  const hasTabIndex = element.hasAttribute('tabindex')
  const isFocusable = element.tabIndex >= 0
  
  expect(hasAriaLabel || hasRole || isFocusable).toBe(true)
}

// Performance Test Helpers
export const measurePerformance = async (fn, expectedDuration = 1000) => {
  const startTime = performance.now()
  await fn()
  const endTime = performance.now()
  const duration = endTime - startTime
  
  expect(duration).toBeLessThan(expectedDuration)
  return duration
}

export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0))

export const waitForAnimation = (duration = 300) => 
  new Promise(resolve => setTimeout(resolve, duration))

// Mock Network Conditions
export const mockSlowNetwork = (delay = 2000) => {
  const originalFetch = global.fetch
  global.fetch = vi.fn((...args) => 
    new Promise(resolve => 
      setTimeout(() => resolve(originalFetch(...args)), delay)
    )
  )
  return () => { global.fetch = originalFetch }
}

export const mockNetworkError = () => {
  const originalFetch = global.fetch
  global.fetch = vi.fn(() => 
    Promise.reject(new Error('Network request failed'))
  )
  return () => { global.fetch = originalFetch }
}

// Stock and Invoice Validation Helpers
export const validateStockCalculation = (originalItems, modifiedItems, expectedChanges) => {
  const actualChanges = StockReconciliation.calculateStockChanges(originalItems, modifiedItems)
  
  expect(actualChanges.changes).toHaveLength(expectedChanges.length)
  
  expectedChanges.forEach(expected => {
    const actual = actualChanges.changes.find(c => c.partId === expected.partId)
    expect(actual).toBeDefined()
    expect(actual.quantityChange).toBe(expected.quantityChange)
  })
}

export const validateInvoiceStructure = (invoice) => {
  expect(invoice).toHaveProperty('id')
  expect(invoice).toHaveProperty('invoiceNumber')
  expect(invoice).toHaveProperty('customerInfo')
  expect(invoice).toHaveProperty('items')
  expect(invoice).toHaveProperty('totalAmount')
  expect(invoice.customerInfo).toHaveProperty('name')
  expect(invoice.customerInfo).toHaveProperty('contact')
  expect(Array.isArray(invoice.items)).toBe(true)
  expect(typeof invoice.totalAmount).toBe('number')
}

// Conflict Resolution Test Helpers
export const createConflictScenario = (type = 'quantity_conflict') => {
  const localInvoice = createMockInvoice({ version: 1 })
  const remoteInvoice = createMockInvoice({ version: 2 })
  
  switch (type) {
    case 'quantity_conflict':
      localInvoice.items[0].quantity = 3
      remoteInvoice.items[0].quantity = 5
      break
    case 'version_conflict':
      localInvoice.version = 1
      remoteInvoice.version = 3
      break
    case 'customer_conflict':
      localInvoice.customerInfo.name = 'Local Customer'
      remoteInvoice.customerInfo.name = 'Remote Customer'
      break
  }
  
  return { localInvoice, remoteInvoice }
}

// Cleanup Helpers
export const cleanupTestEnvironment = () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  
  // Clear any timers
  vi.clearAllTimers()
  
  // Reset DOM
  document.body.innerHTML = ''
  
  // Clear storage
  localStorage.clear()
  sessionStorage.clear()
}

export default {
  createMockInvoice,
  createMockParts,
  createMockStockChanges,
  createMockConflictAnalysis,
  createMockAuditEntry,
  setupTestEnvironment,
  cleanupTestEnvironment,
  renderWithProviders,
  expectToHaveOXHUBStyling,
  expectToHaveTouchTarget,
  expectToBeAccessible,
  measurePerformance,
  waitForNextTick,
  waitForAnimation,
  mockSlowNetwork,
  mockNetworkError,
  validateStockCalculation,
  validateInvoiceStructure,
  createConflictScenario,
  MockInvoiceContextProvider,
  MockPartsContextProvider
}
