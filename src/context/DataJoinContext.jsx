import { createContext, useContext, useReducer, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebaseConfig'

// DataJoin Context
const DataJoinContext = createContext()

// Initial state
const initialState = {
  joinedCustomerData: [],
  joinedOrderData: [],
  customerOrderHistory: {},
  customerMechanicHistory: {},
  isLoadingJoinedData: false,
  joinDataError: null,
  lastRefreshTime: null
}

// Action types
const DATAJOIN_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_JOINED_CUSTOMER_DATA: 'SET_JOINED_CUSTOMER_DATA',
  SET_JOINED_ORDER_DATA: 'SET_JOINED_ORDER_DATA',
  SET_CUSTOMER_ORDER_HISTORY: 'SET_CUSTOMER_ORDER_HISTORY',
  SET_CUSTOMER_MECHANIC_HISTORY: 'SET_CUSTOMER_MECHANIC_HISTORY',
  SET_ERROR: 'SET_ERROR',
  SET_LAST_REFRESH: 'SET_LAST_REFRESH'
}

// Reducer
function dataJoinReducer(state, action) {
  switch (action.type) {
    case DATAJOIN_ACTIONS.SET_LOADING:
      return { ...state, isLoadingJoinedData: action.payload }
    
    case DATAJOIN_ACTIONS.SET_JOINED_CUSTOMER_DATA:
      return { ...state, joinedCustomerData: action.payload, isLoadingJoinedData: false }
    
    case DATAJOIN_ACTIONS.SET_JOINED_ORDER_DATA:
      return { ...state, joinedOrderData: action.payload }
    
    case DATAJOIN_ACTIONS.SET_CUSTOMER_ORDER_HISTORY:
      return { ...state, customerOrderHistory: action.payload }
    
    case DATAJOIN_ACTIONS.SET_CUSTOMER_MECHANIC_HISTORY:
      return { ...state, customerMechanicHistory: action.payload }
    
    case DATAJOIN_ACTIONS.SET_ERROR:
      return { 
        ...state, 
        joinDataError: action.payload,
        isLoadingJoinedData: false 
      }
    
    case DATAJOIN_ACTIONS.SET_LAST_REFRESH:
      return { ...state, lastRefreshTime: action.payload }
    
    default:
      return state
  }
}

// Provider component
export function DataJoinProvider({ children }) {
  const [state, dispatch] = useReducer(dataJoinReducer, initialState)

  // Join customer data with their orders and mechanic history
  const loadJoinedCustomerData = async () => {
    try {
      dispatch({ type: DATAJOIN_ACTIONS.SET_LOADING, payload: true })
      dispatch({ type: DATAJOIN_ACTIONS.SET_ERROR, payload: null })

      // Get customers from external collection (read-only)
      const customersRef = collection(db, 'customers')
      const customersSnapshot = await getDocs(customersRef)
      const customers = customersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get orders from external collection (read-only)
      const ordersRef = collection(db, 'spare_parts_orders')
      const ordersSnapshot = await getDocs(ordersRef)
      const orders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get mechanics from external collection (read-only)
      const mechanicsRef = collection(db, 'mechanics')
      const mechanicsSnapshot = await getDocs(mechanicsRef)
      const mechanics = mechanicsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Create lookup maps for efficient joining
      const ordersByCustomer = {}
      const mechanicsMap = {}

      // Group orders by customer_id using exact field name from Firebase
      orders.forEach(order => {
        const customerId = order.customer_id
        if (!ordersByCustomer[customerId]) {
          ordersByCustomer[customerId] = []
        }
        ordersByCustomer[customerId].push(order)
      })

      // Create mechanics lookup map
      mechanics.forEach(mechanic => {
        mechanicsMap[mechanic.id] = mechanic
      })

      // Join customer data with orders and mechanic info
      const joinedData = customers.map(customer => {
        const customerOrders = ordersByCustomer[customer.id] || []
        
        // Calculate customer summary metrics
        const totalOrders = customerOrders.length
        const totalSpent = customerOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0)
        const lastOrderDate = customerOrders.length > 0 
          ? Math.max(...customerOrders.map(order => new Date(order.order_date || 0).getTime()))
          : null

        // Get unique mechanics who worked on this customer's orders
        const mechanicsWorked = customerOrders
          .map(order => order.mechanic_id)
          .filter(Boolean)
          .filter((value, index, self) => self.indexOf(value) === index)
          .map(mechanicId => mechanicsMap[mechanicId])
          .filter(Boolean)

        return {
          ...customer,
          // Order history
          orders: customerOrders,
          totalOrders,
          totalSpent,
          lastOrderDate: lastOrderDate ? new Date(lastOrderDate) : null,
          
          // Mechanic history
          mechanicsWorked,
          primaryMechanic: mechanicsWorked.length > 0 ? mechanicsWorked[0] : null,
          
          // Customer status
          isActiveCustomer: lastOrderDate && (Date.now() - lastOrderDate) < (90 * 24 * 60 * 60 * 1000), // Active if order within 90 days
          averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0
        }
      })

      dispatch({ type: DATAJOIN_ACTIONS.SET_JOINED_CUSTOMER_DATA, payload: joinedData })
      dispatch({ type: DATAJOIN_ACTIONS.SET_LAST_REFRESH, payload: new Date() })
    } catch (error) {
      console.error('Error loading joined customer data:', error)
      dispatch({ type: DATAJOIN_ACTIONS.SET_ERROR, payload: error.message })
    }
  }

  // Join order data with customer and mechanic information
  const loadJoinedOrderData = async () => {
    try {
      dispatch({ type: DATAJOIN_ACTIONS.SET_ERROR, payload: null })

      // Get orders from external collection (read-only)
      const ordersRef = collection(db, 'spare_parts_orders')
      const ordersQuery = query(ordersRef, orderBy('order_date', 'desc'))
      const ordersSnapshot = await getDocs(ordersQuery)
      const orders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get customers from external collection (read-only)
      const customersRef = collection(db, 'customers')
      const customersSnapshot = await getDocs(customersRef)
      const customers = customersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get mechanics from external collection (read-only)
      const mechanicsRef = collection(db, 'mechanics')
      const mechanicsSnapshot = await getDocs(mechanicsRef)
      const mechanics = mechanicsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Create lookup maps
      const customersMap = {}
      const mechanicsMap = {}

      customers.forEach(customer => {
        customersMap[customer.id] = customer
      })

      mechanics.forEach(mechanic => {
        mechanicsMap[mechanic.id] = mechanic
      })

      // Join order data with customer and mechanic info using exact field names
      const joinedOrders = orders.map(order => ({
        ...order,
        customerData: customersMap[order.customer_id] || null,
        mechanicData: mechanicsMap[order.mechanic_id] || null,
        customerName: customersMap[order.customer_id]?.name || 'Unknown Customer',
        customerPhone: customersMap[order.customer_id]?.phone || '',
        mechanicName: mechanicsMap[order.mechanic_id]?.name || 'Unassigned',
        mechanicEmail: mechanicsMap[order.mechanic_id]?.email || ''
      }))

      dispatch({ type: DATAJOIN_ACTIONS.SET_JOINED_ORDER_DATA, payload: joinedOrders })
    } catch (error) {
      console.error('Error loading joined order data:', error)
      dispatch({ type: DATAJOIN_ACTIONS.SET_ERROR, payload: error.message })
    }
  }

  // Get customer order history by customer ID
  const getCustomerOrderHistory = async (customerId) => {
    try {
      if (state.customerOrderHistory[customerId]) {
        return state.customerOrderHistory[customerId]
      }

      const ordersRef = collection(db, 'spare_parts_orders')
      const customerOrdersQuery = query(ordersRef, where('customer_id', '==', customerId), orderBy('order_date', 'desc'))
      const ordersSnapshot = await getDocs(customerOrdersQuery)
      
      const orderHistory = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Update state with this customer's order history
      const updatedHistory = { ...state.customerOrderHistory }
      updatedHistory[customerId] = orderHistory

      dispatch({ type: DATAJOIN_ACTIONS.SET_CUSTOMER_ORDER_HISTORY, payload: updatedHistory })
      
      return orderHistory
    } catch (error) {
      console.error('Error getting customer order history:', error)
      dispatch({ type: DATAJOIN_ACTIONS.SET_ERROR, payload: error.message })
      return []
    }
  }

  // Get customer mechanic history
  const getCustomerMechanicHistory = async (customerId) => {
    try {
      if (state.customerMechanicHistory[customerId]) {
        return state.customerMechanicHistory[customerId]
      }

      // Get orders for this customer
      const ordersRef = collection(db, 'spare_parts_orders')
      const customerOrdersQuery = query(ordersRef, where('customer_id', '==', customerId))
      const ordersSnapshot = await getDocs(customerOrdersQuery)
      
      const orders = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get unique mechanic IDs from orders
      const mechanicIds = orders
        .map(order => order.mechanic_id)
        .filter(Boolean)
        .filter((value, index, self) => self.indexOf(value) === index)

      // Get mechanic data
      const mechanicsRef = collection(db, 'mechanics')
      const mechanicsSnapshot = await getDocs(mechanicsRef)
      const allMechanics = mechanicsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Filter mechanics who worked on this customer's orders
      const customerMechanics = allMechanics.filter(mechanic => 
        mechanicIds.includes(mechanic.id)
      )

      // Update state with this customer's mechanic history
      const updatedHistory = { ...state.customerMechanicHistory }
      updatedHistory[customerId] = customerMechanics

      dispatch({ type: DATAJOIN_ACTIONS.SET_CUSTOMER_MECHANIC_HISTORY, payload: updatedHistory })
      
      return customerMechanics
    } catch (error) {
      console.error('Error getting customer mechanic history:', error)
      dispatch({ type: DATAJOIN_ACTIONS.SET_ERROR, payload: error.message })
      return []
    }
  }

  // Search across joined data
  const searchJoinedData = (searchTerm) => {
    const searchTermLower = searchTerm.toLowerCase()
    
    return state.joinedCustomerData.filter(customer => {
      // Search customer fields
      const customerMatch = 
        customer.name?.toLowerCase().includes(searchTermLower) ||
        customer.phone?.toLowerCase().includes(searchTermLower) ||
        customer.email?.toLowerCase().includes(searchTermLower) ||
        customer.address?.toLowerCase().includes(searchTermLower)

      // Search order fields
      const orderMatch = customer.orders?.some(order =>
        order.order_number?.toLowerCase().includes(searchTermLower) ||
        order.notes?.toLowerCase().includes(searchTermLower)
      )

      // Search mechanic fields
      const mechanicMatch = customer.mechanicsWorked?.some(mechanic =>
        mechanic.name?.toLowerCase().includes(searchTermLower) ||
        mechanic.email?.toLowerCase().includes(searchTermLower)
      )

      return customerMatch || orderMatch || mechanicMatch
    })
  }

  // Refresh all joined data
  const refreshJoinedData = async () => {
    await Promise.all([
      loadJoinedCustomerData(),
      loadJoinedOrderData()
    ])
  }

  // Load data on mount
  useEffect(() => {
    loadJoinedCustomerData()
    loadJoinedOrderData()
  }, [])

  const value = {
    // State
    ...state,
    
    // Actions
    loadJoinedCustomerData,
    loadJoinedOrderData,
    getCustomerOrderHistory,
    getCustomerMechanicHistory,
    searchJoinedData,
    refreshJoinedData
  }

  return (
    <DataJoinContext.Provider value={value}>
      {children}
    </DataJoinContext.Provider>
  )
}

// Custom hook to use datajoin context
export function useDataJoin() {
  const context = useContext(DataJoinContext)
  if (!context) {
    throw new Error('useDataJoin must be used within a DataJoinProvider')
  }
  return context
}

export default DataJoinContext