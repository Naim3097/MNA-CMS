import { useState, useEffect, Suspense, lazy } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import LoginScreen from './components/LoginScreen'
import PaymentReceipt from './components/PaymentReceipt'
import { PartsProvider } from './context/PartsContext'
import { InvoiceProvider } from './context/InvoiceContext'
import { CustomerProvider } from './context/CustomerContext'
import { TransactionProvider } from './context/TransactionContext'
import { MechanicsProvider } from './context/MechanicsContext'
import { DataJoinProvider } from './context/DataJoinContext'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebaseConfig'

// Lazy-loaded sections (single "Customer" hub)
const CustomerDatabase = lazy(() => import('./components/CustomerDatabase'))
const PartsManagement = lazy(() => import('./components/PartsManagement'))
const CustomerInvoiceCreation = lazy(() => import('./components/CustomerInvoiceCreation'))
const QuotationCreation = lazy(() => import('./components/QuotationCreation'))
const AccountingDashboard = lazy(() => import('./components/AccountingDashboard'))
const MechanicCommissionDashboard = lazy(() => import('./components/MechanicCommissionDashboard'))

// Single source of truth for navigation + section titles
const NAV_ITEMS = [
  { id: 'customers', label: 'Customers' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customer-invoicing', label: 'Invoices & Billing' },
  { id: 'quotation', label: 'Quotations' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'mechanic-commissions', label: 'Mechanic Commissions' },
]
const SECTION_TITLES = Object.fromEntries(NAV_ITEMS.map((n) => [n.id, n.label]))

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="loading-spinner"></div>
    <span className="ml-3 text-muted text-sm">Loading…</span>
  </div>
)

function App() {
  const [activeSection, setActiveSection] = useState('customers')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isPaymentCallback, setIsPaymentCallback] = useState(false)

  useEffect(() => {
    // Payment callback bypasses the auth gate
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment_status') && params.get('invoice')) {
      setIsPaymentCallback(true)
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <LoadingSpinner />
      </div>
    )
  }

  if (isPaymentCallback) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PaymentReceipt />
      </Suspense>
    )
  }

  const handleLogout = async () => {
    try {
      const { signOut } = await import('firebase/auth')
      await signOut(auth)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={() => {}} />
  }

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'customers':
        return <CustomerDatabase setActiveSection={setActiveSection} />
      case 'inventory':
        return <PartsManagement />
      case 'customer-invoicing':
        return <CustomerInvoiceCreation setActiveSection={setActiveSection} />
      case 'quotation':
        return <QuotationCreation setActiveSection={setActiveSection} />
      case 'accounting':
        return <AccountingDashboard />
      case 'mechanic-commissions':
        return <MechanicCommissionDashboard />
      default:
        return <CustomerDatabase setActiveSection={setActiveSection} />
    }
  }

  return (
    <PartsProvider>
      <InvoiceProvider>
        <CustomerProvider>
          <TransactionProvider>
            <MechanicsProvider>
              <DataJoinProvider>
                <div className="flex h-dvh overflow-hidden bg-bg text-ink">
                  <Sidebar
                    navItems={NAV_ITEMS}
                    activeSection={activeSection}
                    setActiveSection={setActiveSection}
                    isMobileOpen={isMobileSidebarOpen}
                    setIsMobileOpen={setIsMobileSidebarOpen}
                    userEmail={user.email}
                    onLogout={handleLogout}
                  />

                  <div className="flex-1 flex flex-col min-w-0">
                    <Header
                      onLogout={handleLogout}
                      onToggleSidebar={() => setIsMobileSidebarOpen(true)}
                      title={SECTION_TITLES[activeSection]}
                    />
                    <main className="flex-1 overflow-y-auto touch-scroll px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
                      <Suspense fallback={<LoadingSpinner />}>
                        <div className="fade-in max-w-app mx-auto w-full">{renderActiveSection()}</div>
                      </Suspense>
                    </main>
                  </div>
                </div>
              </DataJoinProvider>
            </MechanicsProvider>
          </TransactionProvider>
        </CustomerProvider>
      </InvoiceProvider>
    </PartsProvider>
  )
}

export default App
