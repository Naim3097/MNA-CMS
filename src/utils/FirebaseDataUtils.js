import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  onSnapshot,
  Timestamp
} from 'firebase/firestore'
import { auth, db } from '../firebaseConfig'

// Helper function to check authentication
const checkAuth = () => {
  const user = auth.currentUser
  console.log('🔐 Auth check - Current user:', user ? user.uid : 'Not authenticated')
  return user
}

/**
 * Firebase Data Integration Utilities
 * Uses exact field names from user's Firebase schema
 * 
 * External Collections (Read-Only):
 * - customers: customer data with id, name, phone, email, address
 * - spare_parts_orders: orders with customer_id, mechanic_id, order_date, total_amount, parts, notes
 * - mechanics: mechanic data with id, name, email, phone, specialty
 * 
 * Internal Collections (Read/Write):
 * - customer_invoices: customer-facing invoices
 * - transactions: payment tracking
 * - parts: internal parts management (existing)
 * - invoices: internal invoices (existing)
 */

// ===== CUSTOMER DATA UTILITIES =====

/**
 * Create a new customer
 */
export const createCustomer = async (customerData) => {
  try {
    console.log('📝 Creating new customer:', customerData)
    const customersRef = collection(db, 'customers')
    const docRef = await addDoc(customersRef, {
      name: customerData.name || '',
      phone: customerData.phone || '',
      email: customerData.email || '',
      ic: customerData.ic || '',
      address: customerData.address || '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    })
    console.log('✅ Customer created with ID:', docRef.id)
    return { id: docRef.id, ...customerData }
  } catch (error) {
    console.error('❌ Error creating customer:', error)
    throw error
  }
}

/**
 * Update an existing customer
 */
export const updateCustomer = async (customerId, updatedData) => {
  try {
    const customerRef = doc(db, 'customers', customerId)
    await updateDoc(customerRef, { ...updatedData, updatedAt: Timestamp.now() })
    return { id: customerId, ...updatedData }
  } catch (error) {
    console.error('❌ Error updating customer:', error)
    throw error
  }
}

/**
 * Delete a customer
 */
export const deleteCustomer = async (customerId) => {
  try {
    await deleteDoc(doc(db, 'customers', customerId))
  } catch (error) {
    console.error('❌ Error deleting customer:', error)
    throw error
  }
}

/**
 * Get all customers from external collection
 */
export const getAllCustomers = async () => {
  try {
    const customersRef = collection(db, 'customers')
    const snapshot = await getDocs(customersRef)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  } catch (error) {
    console.error('Error fetching customers:', error)
    throw error
  }
}

/**
 * Get customer by ID from external collection
 */
export const getCustomerById = async (customerId) => {
  try {
    const customerRef = doc(db, 'customers', customerId)
    const snapshot = await getDoc(customerRef)
    
    if (snapshot.exists()) {
      return {
        id: snapshot.id,
        ...snapshot.data()
      }
    }
    return null
  } catch (error) {
    console.error('Error fetching customer:', error)
    throw error
  }
}

/**
 * Search customers by name, phone, or email
 */
export const searchCustomers = async (searchTerm) => {
  try {
    const customers = await getAllCustomers()
    const searchTermLower = searchTerm.toLowerCase()
    
    return customers.filter(customer => 
      customer.name?.toLowerCase().includes(searchTermLower) ||
      customer.phone?.toLowerCase().includes(searchTermLower) ||
      customer.email?.toLowerCase().includes(searchTermLower) ||
      customer.address?.toLowerCase().includes(searchTermLower)
    )
  } catch (error) {
    console.error('Error searching customers:', error)
    throw error
  }
}

/**
 * Get customer orders from external spare_parts_orders collection
 * Using the correct Firestore field structure:
 * - customerId (not customer_id)
 * - orderItems array with namaProduk, kodProduk, unitPrice, totalPrice, quantity
 */
export const getCustomerOrders = async (customerId) => {
  console.log('🚨 FUNCTION CALLED - getCustomerOrders with customerId:', customerId)
  console.log('🚨 Customer ID type:', typeof customerId)
  
  // Check authentication
  const user = checkAuth()
  if (!user) {
    console.warn('⚠️ No authenticated user, but attempting query anyway...')
  }
  
  try {
    const ordersRef = collection(db, 'spare_parts_orders')
    console.log('🔍 Orders collection reference created')
    
    // Query using the correct field name: customerId
    const ordersQuery = query(ordersRef, where('customerId', '==', customerId))
    console.log('🔍 Query created for customerId:', customerId)
    
    const snapshot = await getDocs(ordersQuery)
    console.log('📊 Query executed, found', snapshot.size, 'orders')
    
    // Process the orders and flatten orderItems into individual parts
    const allParts = []
    
    snapshot.docs.forEach(doc => {
      const orderData = doc.data()
      console.log('📋 Processing order:', doc.id)
      console.log('📋 Order creation date:', orderData.createdAt)
      console.log('📋 Order status:', orderData.orderStatus)
      
      // Extract orderItems array
      const orderItems = orderData.orderItems || []
      console.log('📦 Order items found:', orderItems.length)
      
      orderItems.forEach((item, index) => {
        console.log(`📦 Processing item ${index + 1} in order ${doc.id}:`)
        console.log(`   - Part: ${item.namaProduk}`)
        console.log(`   - Code: ${item.kodProduk}`)
        console.log(`   - Price: ${item.unitPrice}`)
        console.log(`   - Quantity: ${item.quantity}`)
        console.log(`   - Spec: ${item.specification}`)
        
        // Transform to match expected structure for the invoice component
        const part = {
          id: `${doc.id}_${index}`, // Unique ID for each part
          orderId: doc.id,
          jobSheetId: orderData.jobSheetId,
          jobSheetNumber: orderData.jobSheetNumber,
          
          // Part details using actual field names
          part_name: item.namaProduk, // Map namaProduk to part_name for component compatibility
          name: item.namaProduk, // Alternative mapping
          kodProduk: item.kodProduk,
          partId: item.partId,
          
          // Pricing
          unit_price: item.unitPrice, // Map for component compatibility  
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          quantity: item.quantity,
          
          // Additional details
          specification: item.specification,
          inventoryStatus: item.inventoryStatus,
          availableQuantity: item.availableQuantity,
          isCustom: item.isCustom,
          supplierNotes: item.supplierNotes,
          estimatedDelivery: item.estimatedDelivery,
          
          // Order metadata
          orderStatus: orderData.orderStatus,
          totalValue: orderData.totalValue,
          createdAt: orderData.createdAt,
          processedAt: orderData.processedAt,
          processedBy: orderData.processedBy,
          processedByRole: orderData.processedByRole,
          updatedAt: orderData.updatedAt
        }
        
        console.log(`✅ Created part object:`, part)
        allParts.push(part)
      })
    })
    
    console.log('📊 All parts before deduplication:', allParts.length)
    
    // Deduplicate parts by combining same parts from multiple orders
    const consolidatedParts = new Map()
    
    allParts.forEach(part => {
      // Create unique key based on part code and unit price
      const partKey = `${part.kodProduk}_${part.unit_price}_${part.specification || 'none'}`
      
      if (consolidatedParts.has(partKey)) {
        // Combine with existing part
        const existingPart = consolidatedParts.get(partKey)
        existingPart.quantity += part.quantity
        existingPart.totalPrice += part.totalPrice
        
        // Combine order IDs to track which orders this part came from
        if (!existingPart.sourceOrderIds) {
          existingPart.sourceOrderIds = [existingPart.orderId]
        }
        existingPart.sourceOrderIds.push(part.orderId)
        
        console.log(`🔄 Consolidated ${part.part_name}: quantity now ${existingPart.quantity} from ${existingPart.sourceOrderIds.length} orders`)
      } else {
        // First occurrence of this part
        consolidatedParts.set(partKey, {
          ...part,
          sourceOrderIds: [part.orderId] // Track source orders
        })
        console.log(`✅ Added new part: ${part.part_name}`)
      }
    })
    
    // Convert back to array
    const finalParts = Array.from(consolidatedParts.values())
    
    // Sort by creation date (newest first)
    finalParts.sort((a, b) => {
      const dateA = new Date(a.createdAt?.toDate?.() || a.createdAt || 0)
      const dateB = new Date(b.createdAt?.toDate?.() || b.createdAt || 0)
      return dateB - dateA
    })
    
    console.log('✅ Final result after consolidation:', finalParts.length, 'unique parts')
    console.log('📊 Consolidated parts summary:', finalParts.map(p => ({ 
      name: p.part_name, 
      price: p.unit_price, 
      quantity: p.quantity,
      total: p.totalPrice,
      fromOrders: p.sourceOrderIds?.length || 1
    })))
    
    return finalParts
    
  } catch (error) {
    console.error('❌ Detailed error in getCustomerOrders:', error)
    console.error('Error code:', error.code)
    console.error('Error message:', error.message)
    
    // If it's a permission issue, provide helpful message
    if (error.code === 'permission-denied') {
      console.error('🚫 Permission denied - Check Firebase security rules')
      throw new Error('Permission denied: Check Firebase security rules or authentication')
    }
    
    // If it's a network issue
    if (error.code === 'unavailable') {
      console.error('🌐 Network unavailable - Check internet connection')
      throw new Error('Network unavailable: Check internet connection')
    }
    
    throw error
  }
}

// ===== CUSTOMER INVOICES UTILITIES (Internal Collection) =====

/**
 * Create a new customer invoice in internal collection
 * Generates invoice number automatically
 */
/**
 * Generate a sequential per-year document number, e.g. INV-2026-0001 / QUO-2026-0001.
 * NOTE: reads the collection to find the current max — fine for workshop volume.
 * For very high concurrency, move to a counter doc in a transaction later.
 */
const generateDocNumber = async (collectionName, prefix, field) => {
  const year = new Date().getFullYear()
  const snap = await getDocs(collection(db, collectionName))
  let max = 0
  snap.forEach((d) => {
    const val = d.data()[field]
    if (typeof val === 'string') {
      const m = val.match(new RegExp('^' + prefix + '-' + year + '-(\\d+)$'))
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > max) max = n
      }
    }
  })
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`
}

export const createCustomerInvoice = async (invoiceData) => {
  try {
    const invoicesRef = collection(db, 'customer_invoices')

    // Sequential per-year invoice number, e.g. INV-2026-0001
    const invoiceNumber = await generateDocNumber('customer_invoices', 'INV', 'invoiceNumber')

    const docRef = await addDoc(invoicesRef, {
      ...invoiceData,
      invoiceNumber: invoiceNumber,
      dateCreated: Timestamp.now(),
      paymentStatus: invoiceData.paymentStatus || 'pending'
    })
    
    console.log('✅ Invoice created:', invoiceNumber, 'with ID:', docRef.id)
    // Return both ID and Number so UI can use them immediately (e.g. for Payment Links)
    return { id: docRef.id, invoiceNumber }
  } catch (error) {
    console.error('Error creating customer invoice:', error)
    throw error
  }
}

/**
 * Get all customer invoices from internal collection
 */
export const getAllCustomerInvoices = async () => {
  try {
    const invoicesRef = collection(db, 'customer_invoices')
    const invoicesQuery = query(invoicesRef, orderBy('dateCreated', 'desc'))
    const snapshot = await getDocs(invoicesQuery)
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  } catch (error) {
    console.error('Error fetching customer invoices:', error)
    throw error
  }
}

/**
 * Update customer invoice data
 */
export const updateCustomerInvoice = async (invoiceId, updatedData) => {
  try {
    const invoiceRef = doc(db, 'customer_invoices', invoiceId)
    await updateDoc(invoiceRef, {
      ...updatedData,
      updatedAt: Timestamp.now()
      // dateCreated is intentionally preserved on edit (do not overwrite history)
    })
  } catch (error) {
    console.error('Error updating customer invoice:', error)
    throw error
  }
}

/**
 * Update customer invoice payment status
 */
export const updateCustomerInvoicePayment = async (invoiceId, paymentData) => {
  try {
    const invoiceRef = doc(db, 'customer_invoices', invoiceId)
    await updateDoc(invoiceRef, {
      paymentStatus: paymentData.status,
      paymentDate: paymentData.status === 'paid' ? new Date() : null,
      paymentMethod: paymentData.method || null,
      ...paymentData
    })
  } catch (error) {
    console.error('Error updating invoice payment:', error)
    throw error
  }
}

// ===== QUOTATION UTILITIES =====

/**
 * Create a new customer quotation
 */
export const createQuotation = async (quotationData) => {
  try {
    const quotationsRef = collection(db, 'quotations')
    
    // Sequential per-year quotation number, e.g. QUO-2026-0001
    const quotationNumber = await generateDocNumber('quotations', 'QUO', 'quotationNumber')

    const docRef = await addDoc(quotationsRef, {
      ...quotationData,
      quotationNumber: quotationNumber,
      dateCreated: Timestamp.now(),
      status: quotationData.status || 'pending'
    })
    
    console.log('✅ Quotation created:', quotationNumber, 'with ID:', docRef.id)
    return docRef.id
  } catch (error) {
    console.error('Error creating quotation:', error)
    throw error
  }
}

/**
 * Get all quotations from collection
 */
export const getAllQuotations = async () => {
  try {
    const quotationsRef = collection(db, 'quotations')
    const quotationsQuery = query(quotationsRef, orderBy('dateCreated', 'desc'))
    const snapshot = await getDocs(quotationsQuery)
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  } catch (error) {
    console.error('Error fetching quotations:', error)
    throw error
  }
}

/**
 * Update quotation data
 */
export const updateQuotation = async (quotationId, updatedData) => {
  try {
    const quotationRef = doc(db, 'quotations', quotationId)
    await updateDoc(quotationRef, {
      ...updatedData,
      updatedAt: new Date()
    })
  } catch (error) {
    console.error('Error updating quotation:', error)
    throw error
  }
}

/**
 * Update quotation status
 */
export const updateQuotationStatus = async (quotationId, status) => {
  try {
    const quotationRef = doc(db, 'quotations', quotationId)
    await updateDoc(quotationRef, {
      status: status,
      statusUpdatedAt: new Date()
    })
  } catch (error) {
    console.error('Error updating quotation status:', error)
    throw error
  }
}

export default {
  // Customer utilities
  createCustomer,
  getAllCustomers,
  getCustomerById,
  searchCustomers,
  getCustomerOrders,
  
  // Customer invoices utilities
  createCustomerInvoice,
  updateCustomerInvoice,
  getAllCustomerInvoices,
  updateCustomerInvoicePayment,
  
  // Quotation utilities
  createQuotation,
  updateQuotation,
  getAllQuotations,
  updateQuotationStatus
}