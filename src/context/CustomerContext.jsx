import { createContext, useContext, useReducer, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebaseConfig'

// Customer Context
const CustomerContext = createContext()

// Initial state
const initialState = {
  customers: [],
  selectedCustomer: null,
  customerOrders: [],
  joinedCustomerData: null,
  isLoadingCustomers: false,
  isLoadingOrders: false,
  customerError: null,
  searchTerm: '',
  filteredCustomers: []
}

// Action types
const CUSTOMER_ACTIONS = {
  SET_LOADING_CUSTOMERS: 'SET_LOADING_CUSTOMERS',
  SET_LOADING_ORDERS: 'SET_LOADING_ORDERS',
  SET_CUSTOMERS: 'SET_CUSTOMERS',
  SET_SELECTED_CUSTOMER: 'SET_SELECTED_CUSTOMER',
  SET_CUSTOMER_ORDERS: 'SET_CUSTOMER_ORDERS',
  SET_JOINED_DATA: 'SET_JOINED_DATA',
  SET_ERROR: 'SET_ERROR',
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_FILTERED_CUSTOMERS: 'SET_FILTERED_CUSTOMERS',
  CLEAR_SELECTION: 'CLEAR_SELECTION'
}

// Reducer
function customerReducer(state, action) {
  switch (action.type) {
    case CUSTOMER_ACTIONS.SET_LOADING_CUSTOMERS:
      return { ...state, isLoadingCustomers: action.payload }
    
    case CUSTOMER_ACTIONS.SET_LOADING_ORDERS:
      return { ...state, isLoadingOrders: action.payload }
    
    case CUSTOMER_ACTIONS.SET_CUSTOMERS:
      return { 
        ...state, 
        customers: action.payload,
        filteredCustomers: action.payload,
        isLoadingCustomers: false 
      }
    
    case CUSTOMER_ACTIONS.SET_SELECTED_CUSTOMER:
      return { ...state, selectedCustomer: action.payload }
    
    case CUSTOMER_ACTIONS.SET_CUSTOMER_ORDERS:
      return { ...state, customerOrders: action.payload, isLoadingOrders: false }
    
    case CUSTOMER_ACTIONS.SET_JOINED_DATA:
      return { ...state, joinedCustomerData: action.payload }
    
    case CUSTOMER_ACTIONS.SET_ERROR:
      return { 
        ...state, 
        customerError: action.payload,
        isLoadingCustomers: false,
        isLoadingOrders: false 
      }
    
    case CUSTOMER_ACTIONS.SET_SEARCH_TERM:
      return { ...state, searchTerm: action.payload }
    
    case CUSTOMER_ACTIONS.SET_FILTERED_CUSTOMERS:
      return { ...state, filteredCustomers: action.payload }
    
    case CUSTOMER_ACTIONS.CLEAR_SELECTION:
      return {
        ...state,
        selectedCustomer: null,
        customerOrders: [],
        joinedCustomerData: null
      }
    
    default:
      return state
  }
}

// Provider component
export function CustomerProvider({ children }) {
  const [state, dispatch] = useReducer(customerReducer, initialState)

  // Load all customers from external 'customers' collection
  const loadCustomers = async () => {
    try {
      dispatch({ type: CUSTOMER_ACTIONS.SET_LOADING_CUSTOMERS, payload: true })
      dispatch({ type: CUSTOMER_ACTIONS.SET_ERROR, payload: null })

      const customersRef = collection(db, 'customers')
      const customersSnapshot = await getDocs(customersRef)
      
      const customersData = customersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      console.log('🔍 Total customers loaded from Firestore:', customersData.length)
      
      // Show all customers (removed bykiAccountCreated filter)
      // Previously filtered for bykiAccountCreated === true, but most customers have this as false
      dispatch({ type: CUSTOMER_ACTIONS.SET_CUSTOMERS, payload: customersData })
    } catch (error) {
      console.error('Error loading customers:', error)
      dispatch({ type: CUSTOMER_ACTIONS.SET_ERROR, payload: error.message })
    }
  }

  // Select customer and load their spare_parts_orders
  const selectCustomer = async (customerData) => {
    try {
      dispatch({ type: CUSTOMER_ACTIONS.SET_LOADING_ORDERS, payload: true })
      dispatch({ type: CUSTOMER_ACTIONS.SET_ERROR, payload: null })

      // Handle both customer object and customer ID
      const customer = typeof customerData === 'string' 
        ? state.customers.find(c => c.id === customerData)
        : customerData

      if (!customer) {
        throw new Error('Customer not found')
      }

      dispatch({ type: CUSTOMER_ACTIONS.SET_SELECTED_CUSTOMER, payload: customer })

      // Get customer's spare_parts_orders using exact field name
      const ordersRef = collection(db, 'spare_parts_orders')
      const ordersQuery = query(
        ordersRef, 
        where('customer_id', '==', customer.id),
        orderBy('order_date', 'desc')
      )
      
      const ordersSnapshot = await getDocs(ordersQuery)
      const ordersData = ordersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      dispatch({ type: CUSTOMER_ACTIONS.SET_CUSTOMER_ORDERS, payload: ordersData })
    } catch (error) {
      console.error('Error selecting customer:', error)
      dispatch({ type: CUSTOMER_ACTIONS.SET_ERROR, payload: error.message })
    }
  }

  // Search customers by name, phone, or email
  const searchCustomers = (searchTerm) => {
    dispatch({ type: CUSTOMER_ACTIONS.SET_SEARCH_TERM, payload: searchTerm })
    
    if (!searchTerm.trim()) {
      dispatch({ type: CUSTOMER_ACTIONS.SET_FILTERED_CUSTOMERS, payload: state.customers })
      return
    }

    const filtered = state.customers.filter(customer => 
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone?.includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    dispatch({ type: CUSTOMER_ACTIONS.SET_FILTERED_CUSTOMERS, payload: filtered })
  }

  // Filter active customers (bykiAccountCreated: true)
  const filterActiveCustomers = () => {
    const activeCustomers = state.customers.filter(customer => 
      customer.bykiAccountCreated === true
    )
    dispatch({ type: CUSTOMER_ACTIONS.SET_FILTERED_CUSTOMERS, payload: activeCustomers })
  }

  // Clear customer selection
  const clearCustomerSelection = () => {
    dispatch({ type: CUSTOMER_ACTIONS.CLEAR_SELECTION })
  }

  // Load customers on mount
  useEffect(() => {
    loadCustomers()
  }, [])

  // Update filtered customers when search term changes
  useEffect(() => {
    searchCustomers(state.searchTerm)
  }, [state.customers])

  const value = {
    // State
    ...state,
    customerSelected: state.selectedCustomer, // Alias for easier access
    
    // Actions
    loadCustomers,
    selectCustomer,
    searchCustomers,
    filterActiveCustomers,
    clearCustomerSelection
  }

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  )
}

// Custom hook to use customer context
export function useCustomer() {
  const context = useContext(CustomerContext)
  if (!context) {
    throw new Error('useCustomer must be used within a CustomerProvider')
  }
  return context
}

export default CustomerContext