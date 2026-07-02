import { useState, useEffect, useRef, Suspense, lazy } from 'react'
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

// Lazy-loaded sections
const Home = lazy(() => import('./components/Home'))
const CustomerDatabase = lazy(() => import('./components/CustomerDatabase'))
const PartsManagement = lazy(() => import('./components/PartsManagement'))
const CustomerInvoiceCreation = lazy(() => import('./components/CustomerInvoiceCreation'))
const QuotationCreation = lazy(() => import('./components/QuotationCreation'))
const AccountingDashboard = lazy(() => import('./components/AccountingDashboard'))
const MechanicCommissionDashboard = lazy(() => import('./components/MechanicCommissionDashboard'))

// Grouped navigation. Items with an `action` are shortcuts that open a builder
// in form mode; the rest switch section directly.
const NAV_GROUPS = [
  { items: [{ id: 'home', label: 'Home' }] },
  {
    title: 'Create',
    items: [
      { id: 'new-invoice', label: 'New invoice', action: 'invoice-form' },
      { id: 'new-quotation', label: 'New quotation', action: 'quotation-form' },
    ],
  },
  {
    title: 'Records',
    items: [
      { id: 'customers', label: 'Customers' },
      { id: 'inventory', label: 'Inventory' },
      { id: 'customer-invoicing', label: 'Invoices' },
      { id: 'quotation', label: 'Quotations' },
    ],
  },
  {
    title: 'Money',
    items: [
      { id: 'accounting', label: 'Accounting' },
      { id: 'mechanic-commissions', label: 'Mechanic Commissions' },
    ],
  },
]

const SECTION_TITLES = {
  home: 'Home',
  customers: 'Customers',
  inventory: 'Inventory',
  'customer-invoicing': 'Invoices & Billing',
  quotation: 'Quotations',
  accounting: 'Accounting',
  'mechanic-commissions': 'Mechanic Commissions',
}

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="loading-spinner"></div>
    <span className="ml-3 text-muted text-sm">Loading…</span>
  </div>
)

function App() {
  const [activeSection, setActiveSection] = useState('home')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isPaymentCallback, setIsPaymentCallback] = useState(false)

  // Navigation "intent" — lets one screen open a builder in the right mode with a
  // prefilled customer / source quote (fixes the customer→invoice handoff).
  const [invoiceIntent, setInvoiceIntent] = useState(null)
  const [quotationIntent, setQuotationIntent] = useState(null)
  const intentNonce = useRef(0)

  useEffect(() => {
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

  const openInvoice = (opts = {}) => {
    intentNonce.current += 1
    setInvoiceIntent({
      nonce: intentNonce.current,
      view: 'form',
      mode: opts.mode || 'repair',
      customer: opts.customer || null,
      quote: opts.quote || null,
    })
    setActiveSection('customer-invoicing')
    setIsMobileSidebarOpen(false)
  }

  const openQuotation = (opts = {}) => {
    intentNonce.current += 1
    setQuotationIntent({
      nonce: intentNonce.current,
      view: 'form',
      mode: opts.mode || 'repair',
      customer: opts.customer || null,
    })
    setActiveSection('quotation')
    setIsMobileSidebarOpen(false)
  }

  const onNavigate = (item) => {
    setIsMobileSidebarOpen(false)
    if (item.action === 'invoice-form') return openInvoice({})
    if (item.action === 'quotation-form') return openQuotation({})
    setActiveSection(item.id)
  }

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
      case 'home':
        return <Home openInvoice={openInvoice} openQuotation={openQuotation} setActiveSection={setActiveSection} />
      case 'customers':
        return <CustomerDatabase setActiveSection={setActiveSection} openInvoice={openInvoice} />
      case 'inventory':
        return <PartsManagement />
      case 'customer-invoicing':
        return (
          <CustomerInvoiceCreation
            setActiveSection={setActiveSection}
            intent={invoiceIntent}
            clearIntent={() => setInvoiceIntent(null)}
          />
        )
      case 'quotation':
        return (
          <QuotationCreation
            setActiveSection={setActiveSection}
            intent={quotationIntent}
            clearIntent={() => setQuotationIntent(null)}
            openInvoice={openInvoice}
          />
        )
      case 'accounting':
        return <AccountingDashboard />
      case 'mechanic-commissions':
        return <MechanicCommissionDashboard />
      default:
        return <Home openInvoice={openInvoice} openQuotation={openQuotation} setActiveSection={setActiveSection} />
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
                    navGroups={NAV_GROUPS}
                    activeSection={activeSection}
                    onNavigate={onNavigate}
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
