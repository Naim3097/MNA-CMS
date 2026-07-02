# BYKI Lite Admin — Complete System Knowledge Base

> **Generated:** 2026-04-27  
> **Scope:** Exhaustive audit of every file, feature, function, logic, and responsiveness state.  
> **Stack:** React 18 + Vite 4 + Firebase 12 + Tailwind 3 + Vitest  
> **Purpose:** Single source of truth for the codebase. Use this as the master reference for any future work (refactors, mobile/tablet responsiveness pass, feature additions).

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [App Bootstrap, Routing & Providers](#2-app-bootstrap-routing--providers)
3. [Firebase Layer](#3-firebase-layer)
4. [Context Providers (Full API)](#4-context-providers-full-api)
5. [Custom Hooks](#5-custom-hooks)
6. [Layout Shell — Header, Sidebar, Navigation](#6-layout-shell--header-sidebar-navigation)
7. [Auth Flow (Dual System)](#7-auth-flow-dual-system)
8. [Customer & Invoicing Domain](#8-customer--invoicing-domain)
9. [Quotation Module](#9-quotation-module)
10. [Payment Receipt & LeanX Integration](#10-payment-receipt--leanx-integration)
11. [Car Status / Repair Order Tracking](#11-car-status--repair-order-tracking)
12. [Parts & Inventory Domain](#12-parts--inventory-domain)
13. [Stock Reconciliation, Atomic Ops, Conflict Resolver, Audit Trail](#13-stock-reconciliation-atomic-ops-conflict-resolver-audit-trail)
14. [HR Domain (6 modules)](#14-hr-domain-6-modules)
15. [Accounting Dashboard](#15-accounting-dashboard)
16. [Mechanic Commission Dashboard](#16-mechanic-commission-dashboard)
17. [PDF Generation](#17-pdf-generation)
18. [Performance Optimizer](#18-performance-optimizer)
19. [Error Handling & Debug Components](#19-error-handling--debug-components)
20. [Testing Setup](#20-testing-setup)
21. [Build / Tooling / Design Tokens](#21-build--tooling--design-tokens)
22. [Documentation Files Summary](#22-documentation-files-summary)
23. [Dead / Legacy Files](#23-dead--legacy-files)
24. [Firebase Collection Schemas (Compiled)](#24-firebase-collection-schemas-compiled)
25. [Responsiveness Inventory & Pain Points](#25-responsiveness-inventory--pain-points)
26. [Critical Issues & Architecture Gaps](#26-critical-issues--architecture-gaps)

---

## 1. Executive Summary

**BYKI Lite Admin** is a single-page React workshop management system for **One X Transmission**, an automotive transmission repair shop. It covers:

- **Spare Parts Management** — inventory CRUD, stock tracking
- **Customer Management** — customer DB, invoices, quotations, repair status, payment links
- **HR Suite** — employees, attendance, leave, payroll, performance reviews
- **Financial** — accounting dashboard, mechanic commissions
- **Payment Integration** — Lean.x (LeanX) hosted payment pages

**Architecture pattern:** No React Router. Section state (`activeSection` string) drives conditional rendering of lazy-loaded components inside a layout shell (Sidebar + Header).

**Provider hierarchy (App.jsx):** `Parts → Invoice → Customer → Transaction → RepairOrder → Employee → DataJoin`

**Real-time strategy:** Firestore `onSnapshot` listeners + localStorage cache + 1-second optimistic-update timeout.

---

## 2. App Bootstrap, Routing & Providers

### Entry — [src/main.jsx](src/main.jsx)
```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
```
- React 18 `createRoot`, StrictMode on, global CSS imported.

### HTML — [index.html](index.html)
- Single `#root` div, ES module script, viewport meta.
- Body: `bg-primary-white text-primary-black font-sans antialiased`.
- Title: "BYKI Lite - Business Management System".

### App Shell — [src/App.jsx](src/App.jsx)

**Auth:** Uses Firebase `onAuthStateChanged` directly (not via `AuthContext`). Three states: loading → unauthenticated (LoginScreen) → authenticated (App shell).

**Payment callback bypass:** If URL contains `?payment_status=...&invoice=...`, renders `PaymentReceipt` directly (skips auth gate).

**Provider nesting (CRITICAL ordering):**
```
PartsProvider
└─ InvoiceProvider
   └─ CustomerProvider
      └─ TransactionProvider
         └─ RepairOrderProvider
            └─ EmployeeProvider
               └─ DataJoinProvider
```
Rationale: Parts is foundational, transactions depend on invoices, data joins aggregate everything.

**Lazy loading:** All section components wrapped in `React.lazy()` + `<Suspense fallback={<LoadingSpinner />}>`.

**Section routing:** Map `activeSection` string → component (15+ sections). Set via `setActiveSection(id)` from Sidebar/Navigation.

**Layout:**
- `<Sidebar>` (persistent on lg, drawer on mobile)
- `<Header>` (sticky top, shows current section title + logout)
- Main content area with fade-in animation
- `isMobileSidebarOpen` state controls drawer

---

## 3. Firebase Layer

### [src/firebaseConfig.js](src/firebaseConfig.js)

**Initialization:** Reads `VITE_FIREBASE_*` env vars via `import.meta.env`.

**Exports:**
- `db` — Firestore instance
- `storage` — Firebase Storage instance
- `auth` — Firebase Auth instance
- `enableNetwork` / `disableNetwork` — connection toggles
- `getNetworkStatus()` — returns boolean tracking `navigator.onLine`

**Network listeners:** `window.addEventListener('online'/'offline', ...)` updates a module-scoped flag.

---

## 4. Context Providers (Full API)

### 4.1 [src/context/AuthContext.jsx](src/context/AuthContext.jsx)
**State:** `{ user, loading, isAuthenticated }`  
**Functions:** `useAuth()`, `logout()` (calls `signOut(auth)`)  
**Listener:** `onAuthStateChanged(auth, cb)` — unsubscribes on unmount.  
**⚠️ Note:** AuthContext is defined but **App.jsx does NOT use it** — App calls `onAuthStateChanged` directly. AuthContext is currently orphaned.

### 4.2 [src/context/CustomerContext.jsx](src/context/CustomerContext.jsx)
**State:** `customers`, `selectedCustomer`, `customerOrders`, `searchTerm`, `filteredCustomers`, `isLoadingCustomers`, `customerError`  
**Functions:**
- `loadCustomers()` — `getDocs(collection(db, 'customers'))` (read-only external collection)
- `selectCustomer(customerData)` — sets selected and loads `spare_parts_orders` where `customer_id == id`
- `searchCustomers(term)` — local filter on name/phone/email
- `filterActiveCustomers()` — filters `bykiAccountCreated: true`
- `clearCustomerSelection()`

### 4.3 [src/context/DataJoinContext.jsx](src/context/DataJoinContext.jsx)
**Purpose:** Cross-collection joins (customers + orders + mechanics).  
**State:** `joinedCustomerData`, `joinedOrderData`, `customerOrderHistory` (Map), `customerMechanicHistory` (Map)  
**Functions:**
- `loadJoinedCustomerData()` — builds enriched objects with `totalOrders`, `totalSpent`, `lastOrderDate`, `mechanicsWorked`, `primaryMechanic`, `isActiveCustomer` (90-day threshold), `averageOrderValue`
- `loadJoinedOrderData()` — orders enriched with customer/mechanic names
- `getCustomerOrderHistory(customerId)`, `getCustomerMechanicHistory(customerId)`

**Performance:** O(n) joins via lookup Maps; not auto-loaded, called explicitly.

### 4.4 [src/context/EmployeeContext.jsx](src/context/EmployeeContext.jsx)

**Constants exported:**
```js
EMPLOYEE_ROLES = { MECHANIC, SERVICE_ADVISOR, MANAGER, RECEPTIONIST, PARTS_SPECIALIST, CASHIER, OWNER }
EMPLOYEE_DEPARTMENTS = { SERVICE, PARTS, ADMINISTRATION, MANAGEMENT }
ATTENDANCE_STATUS = { PRESENT, ABSENT, LATE, ON_LEAVE, SICK }
LEAVE_TYPES = { VACATION, SICK, PERSONAL, EMERGENCY, MATERNITY, PATERNITY }
```

**Real-time listeners:**
- `employees` ordered by `lastName asc`
- `attendance` ordered by `date desc`
- `payroll` ordered by `payPeriodEnd desc`

**Functions:**
| Function | Purpose |
|---|---|
| `addEmployee(data)` | Create with timestamps |
| `updateEmployee(id, updates)` | Patch document |
| `deleteEmployee(id)` | **Soft delete** — sets `status: inactive`, `terminationDate` |
| `clockIn(employeeId)` | Creates attendance doc with PRESENT |
| `clockOut(employeeId, attendanceId)` | Updates with `clockOut: Timestamp` |
| `submitLeaveRequest(data)` | Creates `leave_requests` with `pending` |
| `calculatePayroll(empId, start, end)` | Returns payroll calc (see formula below) |
| `calculateCommission(...)` | **Placeholder — returns 0** |
| `addPerformanceReview(data)` | Creates review doc |
| `getActiveEmployees()` | Filter `status === 'active'` |
| `getEmployeesByDepartment(dept)` | Filter by dept + active |
| `getTodaysAttendance()` | Today's records |

**Payroll formula:**
```
totalHours    = sum(attendance with clockIn & clockOut)
basePay       = hourlyRate ? totalHours * hourlyRate : salary / 26
overtimeHours = max(0, totalHours - 40)
overtimePay   = overtimeHours * hourlyRate * 1.5
commission    = calculateCommission(...) // currently 0
grossPay      = basePay + overtimePay + commission
netPay        = grossPay * 0.8           // simplified 20% tax
```

### 4.5 [src/context/InvoiceContext.jsx](src/context/InvoiceContext.jsx)

**State:** `invoices`, `editingSessions` (Map), `activeEditSession`, `invoiceCounter` (persisted to localStorage `invoice-counter`)

**Invoice number format:** `INV-${year}-${paddedCounter}` → e.g., `INV-2026-0001`

**Functions:**
- `createInvoice(data)` → `{id, ...invoice}` with generated number
- `startInvoiceEdit(id)` → creates EditSession with original snapshot
- `updateInvoiceEdit(sessionId, updates, parts)` → real-time validation, sets `isDirty`
- `validateInvoiceEdit(sessionId, parts)` → uses `InvoiceEditValidator`
- `saveInvoiceEdit(sessionId, parts)` → atomic save via `AtomicOperations.executeInvoiceEdit`, conflict-checked
- `cancelInvoiceEdit(sessionId)` → discard
- `deleteInvoice(id, parts)` → delete + restore stock

**EditSession shape:** `{ id, originalInvoice, currentInvoice, isDirty, isValid, validationErrors, validationWarnings, conflicts, state, lastModified }`

### 4.6 [src/context/PartsContext.jsx](src/context/PartsContext.jsx)

**Part shape:**
```js
{ id, kodProduk, namaProduk, harga, supplier, gambar, specification,
  unitStock, dateAdded, dateUpdated }
```

**Functions:**
| Function | Purpose |
|---|---|
| `addPart(part)` | Add with **1.5s Firebase timeout** + localStorage fallback |
| `updatePart(id, p)` | Patch with `dateUpdated` |
| `deletePart(id)` | Hard delete |
| `updateStock(id, qty)` | Decrement |
| `getPartById(id)` | Sync lookup |
| `searchParts(query)` | Filter on kodProduk/namaProduk/supplier |
| `getLowStockParts(threshold=10)` | Filter `unitStock <= threshold` |
| `batchUpdateStock(updates)` | Atomic via `writeBatch` |
| `reserveStock(reservations)` | Logical-only validation |
| `releaseReservation(sessionId)` | Cleanup |
| `validateStockChanges(changes)` | Pre-flight |
| `retryConnection()` | Exponential backoff |

### 4.7 [src/context/RepairOrderContext.jsx](src/context/RepairOrderContext.jsx)

**Constants:**
```js
REPAIR_STATUSES = { NOT_STARTED, UNDER_INSPECTION, INSPECTION_COMPLETED,
                    REPAIR_ONGOING, READY_FOR_PICKUP }
STATUS_LABELS, STATUS_COLORS // mapped Tailwind classes
```

**State:** `repairOrders`, `statusCounts` (Map), `isLoadingOrders`, `orderError`  
**Functions:** `loadRepairOrders()`, `setupRealtimeListener()` (returns unsubscribe), `calculateStatusCounts()`, `getOrdersByStatus()`, `formatDate()`  
**Read-only** — no write operations (mechanic-side updates).

### 4.8 [src/context/TransactionContext.jsx](src/context/TransactionContext.jsx)

**State:** `transactions`, `customerInvoices`, `pendingInvoices`, `paidInvoices`, `accountingSummary`

**`accountingSummary` shape:**
```js
{ totalRevenue, totalPendingAmount, totalCommissions, totalProfit,
  invoiceCount, paidInvoiceCount, pendingInvoiceCount, averageInvoiceValue }
```

**Functions:**
- `loadTransactions()`, `loadCustomerInvoices()`
- `recordPayment(data)` — creates txn `TXN-${timestamp}` + updates invoice paymentStatus
- `updatePaymentStatus(invoiceId, status)`
- `generateAccountingSummary()` — recomputed on invoice change

---

## 5. Custom Hooks

### 5.1 [src/hooks/useFirebaseData.js](src/hooks/useFirebaseData.js) — `useFirebaseCollection(name)`

Generic CRUD hook with **offline-first** strategy:
1. **localStorage first** for instant display
2. **Firebase listener** for delta updates (`onSnapshot`)
3. **1-second timeout** before falling back to offline
4. **Optimistic updates**: temp ID → replaced on Firebase ack

**Returns:** `{ data, loading, error, retryCount, addItem, updateItem, deleteItem, retryConnection }`

**Retry strategy:** `Math.min(1000 * 2^retryCount, 5000)` exponential backoff.

**Error mapping:**
- `permission-denied` → "Database access denied"
- `unavailable` → "Database temporarily unavailable"
- Network → "Network connection issue"
- Default → "Working offline"

### 5.2 [src/hooks/useInvoiceEditor.js](src/hooks/useInvoiceEditor.js) — `useInvoiceEditor(invoiceId, invoiceProp?)`

**Returns:** `{ invoice, loading, error, editSession, startEdit, updateEdit, saveEdit, cancelEdit }`

**Load priority:** `invoiceProp` (immediate) → `invoiceId` Firebase listener → no-op.

**Workflows:**
- `startEdit()`: snapshot original → record in AuditTrail → store start time in sessionStorage → create EditSession
- `updateEdit(updates, parts)`: merge → run `StockReconciliation.analyzeInvoiceEdit()` → set `isDirty`/errors/warnings
- `saveEdit(parts)`: validate → `ConflictResolver.checkForConflictsBeforeSave()` → if conflicts, return `{hasConflicts, conflicts, conflictAnalysis}` → else `AtomicOperations.executeInvoiceEdit()`

**Performance tracking:** `sessionStorage.edit_start_time`; metrics wrapped via `PerformanceOptimizer.monitorPerformance()`.

---

## 6. Layout Shell — Header, Sidebar, Navigation

### 6.1 [src/components/Header.jsx](src/components/Header.jsx)
- Sticky top, `z-30`.
- Layout: `[☰ mobile toggle] | Title + Subtitle | Date | Logout`
- Mobile toggle (`onToggleSidebar`) visible at `lg:hidden`.
- Subtitle and date `hidden sm:block`.
- Logout: hover red, exit icon SVG.
- Padding: `px-4 sm:px-6`.

### 6.2 [src/components/Sidebar.jsx](src/components/Sidebar.jsx)

**Desktop:** `lg:static lg:h-screen`, `w-64`, `bg-slate-900 text-white`, always visible.  
**Mobile:** `fixed top-0 left-0 z-50 h-full`, slides via `translate-x-0` / `-translate-x-full`, `duration-300 ease-in-out`, with backdrop `bg-black bg-opacity-50 z-40`.

**Logo area:** Blue "B" badge + "BYKI Lite" / "Business Manager"; close X visible on mobile only.

**Nav groups (3, collapsible):**
- **SPARE PARTS** (default open): Parts Management, Create Invoice, Invoice History
- **CUSTOMER** (default open): Customer Database, Car Status, Quotations, Billing & Invoices, Accounting, Mechanic Commissions
- **HUMAN RESOURCES** (default closed): Dashboard, Employees, Attendance, Leaves, Payroll, Reviews

**Active styling:** `bg-blue-600 text-white shadow-md`. Inactive: `text-slate-300 hover:bg-slate-800`.

**Footer:** Avatar placeholder + "Staff Member / Online" (green).

**⚠️ Touch targets:** Nav items use `py-2` (8px) — **below WCAG 44px minimum.** Recommend `py-3` or `py-4` on mobile.

### 6.3 [src/components/Navigation.jsx](src/components/Navigation.jsx)
**Status:** **Redundant horizontal-tab navigation**. Renders dropdown menus duplicating Sidebar functionality. Two independent nav systems managing same `activeSection` state — **candidate for removal**.

### 6.4 Section → Component Map

| Section ID | Component | File |
|---|---|---|
| `parts` | PartsManagement | [PartsManagement.jsx](src/components/PartsManagement.jsx) |
| `invoice` | InvoiceGeneration *(legacy)* | [InvoiceGeneration.jsx](src/components/InvoiceGeneration.jsx) |
| `history` | InvoiceHistory *(legacy)* | [InvoiceHistory.jsx](src/components/InvoiceHistory.jsx) |
| `customers` | CustomerDatabase | [CustomerDatabase.jsx](src/components/CustomerDatabase.jsx) |
| `car-status` | CarStatus | [CarStatus.jsx](src/components/CarStatus.jsx) |
| `quotation` | QuotationCreation | [QuotationCreation.jsx](src/components/QuotationCreation.jsx) |
| `customer-invoicing` | CustomerInvoiceCreation **(active)** | [CustomerInvoiceCreation.jsx](src/components/CustomerInvoiceCreation.jsx) |
| `accounting` | AccountingDashboard | [AccountingDashboard.jsx](src/components/AccountingDashboard.jsx) |
| `mechanic-commissions` | MechanicCommissionDashboard | [MechanicCommissionDashboard.jsx](src/components/MechanicCommissionDashboard.jsx) |
| `hr-dashboard` | HRDashboard | [HRDashboard.jsx](src/components/HRDashboard.jsx) |
| `employee-management` | EmployeeManagement | [EmployeeManagement.jsx](src/components/EmployeeManagement.jsx) |
| `attendance-tracking` | AttendanceTracking | [AttendanceTracking.jsx](src/components/AttendanceTracking.jsx) |
| `leave-management` | LeaveManagement | [LeaveManagement.jsx](src/components/LeaveManagement.jsx) |
| `payroll-management` | PayrollManagement | [PayrollManagement.jsx](src/components/PayrollManagement.jsx) |
| `performance-reviews` | PerformanceReviews | [PerformanceReviews.jsx](src/components/PerformanceReviews.jsx) |

---

## 7. Auth Flow (Dual System)

### 7.1 [src/components/Login.jsx](src/components/Login.jsx) — Hardcoded test gate
- Single password input, validates `Onex@1234` (hardcoded).
- 800ms simulated delay.
- Stores `localStorage.onex_auth = 'authenticated'` on success.
- No user identity tracked.

### 7.2 [src/components/LoginScreen.jsx](src/components/LoginScreen.jsx) — Production Firebase Auth
- Email/password via `signInWithEmailAndPassword(auth, email, password)`.
- Pre-filled email: `staff@onexhub.com`.
- Granular error mapping for 6+ Firebase auth error codes (`auth/user-not-found`, `auth/wrong-password`, `auth/invalid-email`, `auth/too-many-requests`, `auth/network-request-failed`, `auth/invalid-credential`).
- Calls `onLoginSuccess()` callback on success.

### 7.3 Session Persistence
- App.jsx uses `onAuthStateChanged` directly, NOT AuthContext.
- AuthContext exists but unused → **orphaned code**.
- **No role-based access control** — all authenticated users see all sections.

---

## 8. Customer & Invoicing Domain

### 8.1 [src/components/CustomerDatabase.jsx](src/components/CustomerDatabase.jsx)

**Layout:** Stats overview (3-col → md:4-col) + tabbed card.

**Stats cards:** Total Customers | Active (Recent, ≤30 days) | Avg Spend.

**Tabs:**
- **Active Customers** — real-time `useCustomer()` data
- **Past Transactions** — aggregated from `customer_invoices` (grouped by `customerId`, sorted by `lastInvoiceDate desc`)

**CRUD:**
- **Create:** "+ Add Customer" modal → `createCustomer(data)` from FirebaseDataUtils. Required: `name`, `phone`. Optional: email, address.
- **Read:** Real-time + aggregated past customers.
- **Update:** Inline edit of IC and Address in selected modal only.
- **Delete:** ❌ NOT IMPLEMENTED.

**Search:** name / phone / email (case-insensitive client-side).

**Modals:**
1. Add Customer Modal (`max-w-md`)
2. View Customer Modal (Active) — name, phone, email, IC, address, "Create New Invoice" button
3. View Past Customer Modal — Total Spent / Visits / Last Visited + transaction list (`max-h-[80vh] overflow-y-auto`)

### 8.2 [src/components/CustomerInvoiceCreation.jsx](src/components/CustomerInvoiceCreation.jsx) — **PRIMARY ACTIVE INVOICE COMPONENT**

**Routed at:** `customer-invoicing`

**3 view modes:** `list` | `form` | `analysis` (state machine).

#### List View
- Stats cards (4-col): Total Invoices | Total Revenue | Total Profit (with margin %) | Action buttons
- Filterable table: Date | Ref # | Customer | Mechanic | Amount | Deposit | Status | Actions
- Filters: All / Unpaid / Deposit Paid / Full Payment
- Sorts: Date / Amount / Customer / Balance Due (asc/desc toggle)
- Search: customer name OR invoice number

#### Form View — Sections in order
1. **Customer Selection** (modal trigger or display)
2. **Customer IC & Address** (inline editable in blue box)
3. **Vehicle Information** (Make/Model, Plate No, Work Description) — `md:grid-cols-3`
4. **Discount** (% vs RM toggle) — `bg-gray-50`
5. **Parts & Labor** — `+ Part` / `+ Labor` buttons; inline-editable tables
6. **Payment & Deposit** (`bg-blue-50`) — Deposit Paid (Offline), Request Deposit (Link), Balance Due
7. **Internal Costing & Commission** (`bg-yellow-50`) — Supplier Cost, Mechanic Commission (per-staff %/RM toggle), Net Profit
8. **Footer** — discount summary, total, Save button

#### Analysis View
- Search box + table: Invoice # | Mechanic(s) | Revenue | Cost | Net Profit | Margin %.

#### Form State (full)
```js
{ viewMode, isEditing, editingId, selectedCustomer, showCustomerModal,
  manualParts: [{ sku, partName, quantity, pricePerUnit, total }],
  laborCharges: [{ description, amount }],
  vehicleInfo: { make, model, year, plate },
  workDescription,
  discount, discountType ('percentage'|'fixed'),
  deposit, depositStatus ('none'|'paid_offline'|'link_generated'|'paid_link'),
  requestDepositAmount, paymentStatus, paymentTerms, notes,
  useDirectLending, directLendingAmount,
  totalPartsSupplierCost,
  mechanics: [{ id, name, commissionType, commissionValue, commissionAmount }],
  parentInvoiceId, parentInvoiceNumber,
  invoiceHistory, searchQuery, sortField, sortDirection, statusFilter }
```

#### Calculation — `calculateTotals()`
```
partsTotal      = Σ(qty × price), each line rounded to 2dp
laborTotal      = Σ(amount)
subtotal        = partsTotal + laborTotal (rounded)
discountAmount  = type=='fixed' ? discount : (subtotal × discount/100)
total           = subtotal − discountAmount
balanceDue      = total − deposit
directLending   = useDirectLending ? amount : 0
customerPayable = useDirectLending ? balanceDue − directLending : balanceDue
commission per mechanic:
  type=='percentage' ? (subtotal × value/100) : value
totalCommission = Σ(per-mechanic commission)
```
**Rounding:** `Math.round(x * 100) / 100` everywhere to prevent float drift.

#### Validation
- Customer required.
- At least one part OR labor required.
- All numeric fields default to 0 if blank.

#### Save Flow
1. Validate → sanitize (recursive: `undefined` → `null` for Firebase safety).
2. Build raw data object.
3. Editing → `updateCustomerInvoice(editingId, data)`; New → `createCustomerInvoice(data)` returns `{id, invoiceNumber}`.
4. If `requestDepositAmount > 0` → show payment link modal.
5. Reset form, return to list.

#### Helper Functions
`calculateTotals`, `resetForm`, `handleReturnJob(invoice)` (return/warranty), `handleSaveInvoice`, `handleDelete(id)`, `handleLink(invoice)`, `generateLink()`, `confirmDepositPaid(invoice)`, `getAnalysis()`, `formatCurrency(v)`, `addMechanic(e)`.

#### Modals
1. Customer Selection Modal (search + list)
2. Payment Link Modal (URL display, copy/open, regenerate, manual verification checkbox)
3. Receipt Modal (uses InvoicePreview with `isReceipt={true}`)
4. View Invoice Modal (full detail, print)

### 8.3 [src/components/InvoiceHistory.jsx](src/components/InvoiceHistory.jsx) — Legacy parts-invoice history

- Stats cards (3-col): Total Invoices | Total Revenue | Avg Invoice Value
- Filters: search (#/customer/part code), date range
- Table: Invoice # | Date | Customer | Items | Amount | Actions (View | Edit | PDF | Delete)
- Delete confirm dialog → `deleteInvoice(id, parts)` restores stock.

### 8.4 Edit Invoice Modals

#### [EditInvoiceModal.jsx](src/components/EditInvoiceModal.jsx) — Advanced
- Uses `useInvoiceEditor(invoiceId, invoice)` hook.
- Real-time validation, conflict detection, dirty state tracking.
- Sections: Customer Info | Items | Notes | Internal Cost | Summary.
- Renders `<StockChangeSummary>` for impact analysis.

#### [SimpleEditInvoiceModal.jsx](src/components/SimpleEditInvoiceModal.jsx) — Direct
- Simpler local state, no complex hooks.
- Confirmation dialog before save.
- Calls `AtomicOperations.executeInvoiceEdit()` directly.

### 8.5 [src/components/InvoicePreview.jsx](src/components/InvoicePreview.jsx)

**Modes:**
- Default: full modal + toolbar
- `isViewMode={true}`: minimal modal
- `isReceipt={true}`: receipt-specific (replaces "Total Due" with "PAID", removes deposit section)
- `renderTrigger={fn}`: hidden mode for external triggers (used by PaymentReceipt)

**Sections:** Header (logo + ONE X TRANSMISSION + invoice #) | Customer & Vehicle (2-col) | Line Items table (chunked 20/page on print) | Totals | Footer.

**Print CSS:**
```css
@page { size: A4; margin: 15mm; }
@media print {
  table { display: table-header-group; }  /* Repeat headers */
  tr { page-break-inside: avoid; }
  .no-print { display: none; }
  -webkit-print-color-adjust: exact !important;
}
```

**`handlePrint()`:** Opens 900×600 popup, writes HTML+CSS, calls `printWindow.print()`.

### 8.6 [src/types/InvoiceTypes.js](src/types/InvoiceTypes.js)

**Enums:**
```js
InvoiceEditSessionState = { IDLE, EDITING, VALIDATING, SAVING, ERROR }
StockChangeType = { ADD_PART, REMOVE_PART, INCREASE_QTY, DECREASE_QTY, REPLACE_PART }
ValidationErrorType = { INSUFFICIENT_STOCK, PART_NOT_FOUND, INVALID_QUANTITY,
                        INVALID_PRICE, INVOICE_NOT_FOUND, CONCURRENT_EDIT }
```

**Factory functions:** `createStockChange`, `createInvoiceEditSession`, `createValidationResult`, `createAuditEntry`, `createContextualError`.

### 8.7 [src/utils/InvoiceEditValidator.js](src/utils/InvoiceEditValidator.js)

Static class with:
- `validatePartExists(partId, parts)`
- `validateStockAvailable(partId, quantity, parts)` — errors if insufficient, warnings if low
- `validatePricing(item)` — original > 0, markup 0–1000%, fixed ≥ 0
- `validateInvoiceIntegrity(invoice, parts)` — id/number, items non-empty, totals match, no duplicate parts
- `validateInvoiceEditable(invoice)` — warnings if >30 days old or >5 edits
- `validateRealTime(editSession, parts)` — integrity + editability + session ≤30 min

---

## 9. Quotation Module

### [src/components/QuotationCreation.jsx](src/components/QuotationCreation.jsx)

**Routed at:** `quotation`

**Differences vs Invoice:**
| Feature | Invoice | Quotation |
|---|---|---|
| Doc type | INVOICE | QUOTATION |
| Validity | Due date | Valid Until (configurable days) |
| Status | Pending/Deposit-paid/Paid | Pending/Accepted/Rejected/Expired |
| Payment links | Yes | No |
| Mechanics/Commission | Yes | No |
| Deposit | Yes | No |
| DirectLending | Yes | No |
| Terms | Notes | Customer-visible Terms |

**View modes:** `list` | `form`.

**Form state:**
```js
{ selectedCustomer, vehicleInfo, workDescription,
  manualParts, laborCharges,
  validityDays (default 30), discount (% only), notes,
  terms (default: "Quote valid for 30 days...") }
```

**Status colors:** accepted=green, rejected=red, expired=gray, pending=yellow.

**Save:** `createQuotation(data)` or `updateQuotation(id, data)`.

### Legacy: [src/components/QuotationCreation_OLD.jsx](src/components/QuotationCreation_OLD.jsx) — deletion candidate.

---

## 10. Payment Receipt & LeanX Integration

### 10.1 [src/components/PaymentReceipt.jsx](src/components/PaymentReceipt.jsx)

**URL detection:** `?payment_status=success&invoice=INV-001&amount=100` (App.jsx routes here).

**Flow:**
1. **If `payment_status === 'success'`:** Fetch invoice → update DB (deposit += amount, balanceDue -= amount, depositStatus → `paid_link`, paymentStatus → `deposit-paid` or `paid`).
2. **If ambiguous:** Run LeanxService API verification → update DB if confirmed.
3. **Auto-redirect** after 500ms to `invoice.lastPaymentLink` (gateway URL — UX expectation).
4. **Fallback UI** if no link: green "Official Receipt" + Download PDF button.

**Functions:** `fetchInvoice(invNum, mode, retryCount)` (modes: `success_update` | `verify_db` | `readonly`), `handleRetryPayment()`.

### 10.2 [src/utils/LeanxService.js](src/utils/LeanxService.js)

**Config:**
```js
{ apiHost: 'https://api.leanx.io',
  collectionUuid: 'Dc-E5317E6652-Lx',  // One X Transmission
  authToken: VITE_LEANX_AUTH_TOKEN,
  redirectBaseUrl: window.location.origin }
```

**`generatePaymentLink(invoice, customer, overrideAmount?)`:**
- Validates amount > 0, phone ≥9 digits.
- POSTs to `/api/v1/merchant/create-bill-page` with `auth-token` header.
- Redirect URL: `${baseUrl}/?payment_status=verify&invoice=${num}&amount=${amt}` (uses `verify` for frontend-side confirmation).
- Robust response parsing: tries `data.url` → `payment_url` → `redirect_url` → `link` → `data.data.*`. ID extracted similarly with URL fallback.
- Returns `{ success, url, id, ref }` or `{ success: false, error }`.

**`checkPaymentStatus(billId)`:**
- Tries 3 endpoints in order: `/api/v1/bills/{id}` → `/api/v1/merchant/bills/{id}` → `/api/v1/open/bills/{id}`.
- Parses paid status from multiple possible response shapes.

---

## 11. Car Status / Repair Order Tracking

### [src/components/CarStatus.jsx](src/components/CarStatus.jsx)

**Data:** `useRepairOrder()` + Firestore `byki_status` collection.

**Layout:**
- **Status overview cards** (2–4 cols, clickable to filter): NOT_STARTED, UNDER_INSPECTION, INSPECTION_COMPLETED, REPAIR_ONGOING, READY_FOR_PICKUP.
- **Main table:** Vehicle Details | Customer | Status & Progress | Last Update | Action.
- **Progress indicator:** color-coded bar (blue ongoing, green ready).

**Search:** make/model, plate, customer name.

---

## 12. Parts & Inventory Domain

### 12.1 [src/components/PartsManagement.jsx](src/components/PartsManagement.jsx)

**State:** `showAddForm`, `searchQuery`, `editingPart`, `activeFilter` (`all`|`low_stock`).

**Stats (3-col grid):**
- Total Products = `parts.length`
- Total Value = `Σ(harga × unitStock)` formatted MYR (`Intl.NumberFormat('ms-MY', {style:'currency', currency:'MYR'})`)
- Low Stock Alert = count where `unitStock <= 10` (clickable, toggles filter)

**Toolbar:** Search input (`w-full md:w-96`) + Add New Part button.

**Table:** 5 cols — Product Info (thumbnail + name + supplier) | Code | Stock Level (color-coded badge: out/low/in) | Price | Actions (edit/delete on hover via `opacity-0 group-hover:opacity-100`).

**Delete:** `window.confirm` → `deletePart(part.id)`.

### 12.2 [src/components/PartsTable.jsx](src/components/PartsTable.jsx) — Reusable mobile+desktop table

- Mobile (`lg:hidden`): card view, stacked, truncated text.
- Desktop (`hidden lg:block`): full 8-column table.

### 12.3 [src/components/AddPartForm.jsx](src/components/AddPartForm.jsx)

**Modal:** `modal-overlay` + `modal-content sm:max-w-2xl`. Sticky header/footer.

**Fields (all required except marked):**
- Product Code, Price (RM, step 0.01), Product Name, Supplier, Stock Quantity
- Image (optional): file upload OR URL
  - **Compression:** mobile <768px → 400px max, 0.6 quality, 400KB; desktop → 600px, 0.8 quality, 600KB. Fallback 0.4 quality.
  - Validation: type prefix `image/`, size ≤5MB.
- Specifications (optional textarea)

**Validation:** required fields non-empty, price > 0, stock ≥ 0.

**Submit:** Optimistic with `temp-${Date.now()}` ID, calls `addPart(formData)`, tolerates timeout.

### 12.4 [src/components/EditPartModal.jsx](src/components/EditPartModal.jsx)

Same fields as AddPartForm pre-populated. Plus **Part History** section: `Date Added`, `Last Updated`. Submit calls `updatePart(part.id, data)`.

### 12.5 [src/components/PartsSelector.jsx](src/components/PartsSelector.jsx)

Used inside invoice/quotation creation. State: `searchQuery`, `quantities` (Map).

**Per part item:** Image + code/name/supplier + price + stock badge. Quantity input (`min=1, max=availableStock`) + "Add to Invoice"/"Add More" button.

**`getAvailableStock(part)`:** `part.unitStock - alreadySelected`.

**Empty states:** "No parts found" or "No parts in inventory".

### 12.6 [src/components/StockChangeSummary.jsx](src/components/StockChangeSummary.jsx)

Visual summary during invoice editing.

**Header:** Title + error/warning badges + expand toggle.

**Stats grid (4-col):** Added | Removed | Modified | Net Changes.

**Validation Errors section:** First 3 (or all if expanded), each `bg-red-50 border-primary-red`.

**Expanded sections:** Additions ➕, Removals ➖, Modifications 🔄 (with qty change `X → Y` and price change), Net Stock Changes (2-col grid), Warnings.

**Color helpers:** `getImpactColor(change)` → green/red/gray; `getImpactIcon(change)` → ↗/↘/➡.

### 12.7 [src/components/ConflictResolutionModal.jsx](src/components/ConflictResolutionModal.jsx)

Renders when invoice version conflicts detected.

**Structure:**
- Header (red bg): "Conflict Resolution Required" + invoice #
- Body: Summary (Total/Warnings/Severity) + Strategies list + Detailed conflicts (manual mode) + Warnings
- Footer: Cancel + Apply (with optional confirmation warning)

**4 strategies (from `ConflictResolver.generateResolutionStrategies`):**
1. **Reload** — discard changes, low risk
2. **Force Overwrite** — high risk, requires confirmation
3. **Auto Merge** — medium risk, recommended when safe
4. **Manual Resolution** — low risk, recommended (≤5 conflicts)

**Manual mode UI:** Per conflict — Show Details toggle, side-by-side Your Value vs Other User's Value, radio options (`use_local`, `use_remote`, `manual`, `reload`).

---

## 13. Stock Reconciliation, Atomic Ops, Conflict Resolver, Audit Trail

### 13.1 [src/utils/StockReconciliation.js](src/utils/StockReconciliation.js)

Static methods:

| Method | Returns |
|---|---|
| `calculateStockChanges(orig, edited)` | `{partId → netChange}` (positive = restore) |
| `restoreStockForDeletedInvoice(invoice)` | `{partId → quantity}` |
| `validateStockAvailability(changes, parts)` | `{isValid, issues[]}` |
| `calculateDifferences(origItems, newItems)` | `{additions, removals, modifications, unchanged}` |
| `calculateNetStockImpact(differences)` | `Map<partId, netChange>` |
| `generateStockUpdates(impact, parts)` | Array of update ops with metadata |
| `createAuditTrail(differences, invoiceId, userId)` | Array of audit entries |
| `analyzeInvoiceEdit(orig, modified, parts)` | **Master function** — runs all of the above, returns `{differences, stockImpact, validation, stockUpdates, auditTrail, summary}` |

### 13.2 [src/utils/AtomicOperations.js](src/utils/AtomicOperations.js)

**`executeInvoiceEdit(invoiceId, modifiedInvoice, currentParts, originalInvoice)`** — 11-step pipeline:
1. Pre-flight conflict check (`ConflictResolver.checkForConflictsBeforeSave`)
2. `StockReconciliation.analyzeInvoiceEdit()`
3. Validate `analysis.validation.isValid`
4. `AuditTrail.recordEditStart()`
5. Create Firebase batch
6. Update invoice (preserve `dateCreated`, set `updatedAt`/`lastEditedAt`, increment `editCount`/`version`, record `lastEditSession`)
7. Update affected parts' stock with `lastStockChange` metadata
8. Create audit trail entries per change
9. Atomic batch commit
10. `AuditTrail.recordEditCompletion()`
11. Clear performance cache

**`deleteInvoiceWithStockRestoration(id, invoice, parts)`:** Calculates restoration, validates parts exist, deletes invoice doc, restores stock atomically, creates deletion audit entry.

**`validateTransaction(operations)`** — pre-validates batch ops.

**`checkOperationValidity(invoiceId, expectedVersion)`** — version check before save.

**`rollbackChanges(operationId)`** — best-effort logging only (Firebase batches are atomic).

### 13.3 [src/utils/ConflictResolver.js](src/utils/ConflictResolver.js)

**`detectConflicts(local, remote)`** — checks: version, items (qty/price >0.01), added/removed items, customer info (name/contact/address), notes.

**Returns:** `{ hasConflicts, hasWarnings, conflicts, warnings, severity, resolutionRequired }`.

**`generateResolutionStrategies()`** — see modal section 12.7.

**`canAutoMerge()`** — true if no critical/version/quantity conflicts.

**`autoMerge()`** — base from remote, intelligently merge items (`mergeItems()`), prefer local for editable fields (customer info, notes), recalculate totals, set version + `lastMerged` + `mergeSource`.

**`checkForConflictsBeforeSave(invoiceId, expectedVersion)`** — fetches remote, compares versions, checks deletion.

**`createResolutionUIData()`** — formats for modal UI.

**Helpers:** `formatValue(value, type)`, `getRecommendedAction(conflict)`.

### 13.4 [src/utils/AuditTrail.js](src/utils/AuditTrail.js)

Writes to Firebase `audit_trail` collection.

**Methods:** `recordEntry`, `recordInvoiceCreation`, `recordEditStart`, `recordEditCompletion`, `recordInvoiceDeletion`, `recordStockOperation`, `recordError`, `getInvoiceAuditHistory(invoiceId, limit=50)`, `getRecentAuditEntries(limit=100)`.

**Helpers:** `calculateChanges`, `compareCustomerInfo`, `compareItems`, `generateEditSessionId()` (`edit_${Date.now()}_${random}`), `getSessionId()` (sessionStorage), `getEditDuration()`, `formatForDisplay`, `formatActionName`, `generateSummary`.

**Each entry stamped:** timestamp, sessionId, userAgent, client info. Failures don't break main operations.

### 13.5 [src/utils/FirebaseDataUtils.js](src/utils/FirebaseDataUtils.js)

**Customer functions:** `createCustomer`, `getAllCustomers`, `getCustomerById`, `searchCustomers`, `getCustomerOrders` (heavy normalization + deduplication of `spare_parts_orders` items).

**Customer Invoice functions:** `createCustomerInvoice` (auto-num `INV-${Date.now()}`), `getAllCustomerInvoices`, `updateCustomerInvoice`, `updateCustomerInvoicePayment`.

**Quotation functions:** `createQuotation` (auto-num `QUO-${Date.now()}`), `getAllQuotations`, `updateQuotation`, `updateQuotationStatus`.

### 13.6 [src/utils/DebugCustomerOrders.js](src/utils/DebugCustomerOrders.js)
Debug helper: `debugCustomerOrders(customerId)` — analyzes order frequency, logs duplicate patterns.

---

## 14. HR Domain (6 modules)

### 14.1 [HRDashboard.jsx](src/components/HRDashboard.jsx)
- Header: title + localized date
- KPI cards (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`): Total Employees | Present Today | Absent Today | Late Today
- Department breakdown (`lg:grid-cols-2`)
- Quick Actions card (4 buttons: Add, Time Clock, Generate Payroll, Reviews)
- Recent Employees list (top 5)
- System Status (4 hardcoded indicators; Reviews shows "Setup Required" yellow)

### 14.2 [EmployeeManagement.jsx](src/components/EmployeeManagement.jsx)

**State:** `showAddForm`, `selectedEmployee`, `searchTerm`, `filterDepartment`, `isSubmitting`.

**Form:** firstName, lastName, email, phone, role, department, hourlyRate, salary, startDate, address, emergencyContact, emergencyPhone, notes.

**Required:** firstName, lastName, role, department.

**`handleSeedMechanics()`:** Pre-loads `['Man', 'Bob', 'Black', 'Angah', 'Hatem', 'Fuad', 'Wan']` as Staff/Workshop with dummy emails (`{name}@onex.com`). Dedupe check.

**Filtering:** name OR email + department.

**Stats:** Total Staff | Departments count.

**Table:** Employee | Role/Dept | Contact | Status (hardcoded "Active") | Actions.

### 14.3 [AttendanceTracking.jsx](src/components/AttendanceTracking.jsx)

**3 tabs:** Time Clock | Daily Report | Leave Requests.

**Time Clock:**
- KPI cards: Present | Absent | Late | On Leave
- Per-employee row: Avatar/name/role + status badge + clock times + Hours Worked + Clock In/Out button
- `getEmployeeStatus(empId)` → `not_clocked_in` | `clocked_in` | `clocked_out`
- `calculateHoursWorked(in, out)` → `(out - in) / 1000 / 60 / 60`, rounded to 2dp

**Daily Report:** Date picker → table (Employee | Clock In | Clock Out | Hours | Status).

**Leave Requests:** Form (employee, type, dates, reason, notes) → `submitLeaveRequest()`. Display section is **placeholder only** (no list).

### 14.4 [LeaveManagement.jsx](src/components/LeaveManagement.jsx)

**Leave configurations:**
```js
{ annual: { allocation: 15, carryOver: true, requiresApproval: true },
  sick: { allocation: 15, carryOver: false, requiresApproval: false },
  unpaid: { allocation: 15, requiresApproval: true },
  emergency: { allocation: 5, requiresApproval: true },
  maternity: { allocation: 90, requiresApproval: true },
  paternity: { allocation: 14, requiresApproval: true } }
```

**Functions:**
- `calculateDays(start, end, isHalfDay)` — `Math.ceil((end-start)/86400000) + 1`, halved if `isHalfDay`
- `handleDateChange(field, value)` — auto-recalculates `totalDays`
- `handleSubmitLeave(e)` — creates `leave_requests` doc; status = `requiresApproval ? 'pending' : 'approved'`
- `fetchLeaveRequests()` — orderBy `appliedDate desc`
- `handleStatusUpdate(id, newStatus, adminNotes)` — patches doc
- `calculateLeaveBalance(empId, type)` — `{ allocated, used, remaining }` based on year-to-date approved leave

**3 tabs:** Leave Requests (table + Approve/Reject) | Leave Balances (per-employee cards with progress bars) | Leave Calendar (placeholder).

**Form fields:** employee, leave type, start/end dates, half-day checkbox, total days display, reason, emergency contact, work coverage, notes.

### 14.5 [PayrollManagement.jsx](src/components/PayrollManagement.jsx)

**Pay period:** Bi-weekly (14 days).  
**`getCurrentPayPeriod()`:** computes from year start.

**Functions:**
- `handleGeneratePayroll()` — single employee
- `handleGenerateAllPayroll()` — all active employees, filters `totalHours > 0`

**Calculation (from EmployeeContext):** see section 4.4.

**3 tabs:** Generate Payroll (controls + results table) | Payroll History (placeholder) | Rates & Settings (table with Edit Rates link).

**Commission eligibility:** `role === MECHANIC || role === SERVICE_ADVISOR`.

### 14.6 [PerformanceReviews.jsx](src/components/PerformanceReviews.jsx)

**Rating scale:** 1–5 (5=Excellent, 4=Good, 3=Satisfactory, 2=Needs Improvement, 1=Unsatisfactory).

**Color mapping:** 5=green, 4=blue, 3=yellow, 2=orange, 1=red.

**Review periods:** Quarterly | Semi-Annual | Annual | Probationary.

**Form fields (all 1–5):** overallRating, jobKnowledge, qualityOfWork, productivity, communication, teamwork, punctuality. Plus textareas: goals, improvements, comments.

**Stats cards:** Average Rating | Total Reviews | This Quarter Reviews.

---

## 15. Accounting Dashboard

### [src/components/AccountingDashboard.jsx](src/components/AccountingDashboard.jsx)

**State:** `selectedTimeframe` (`month`|`year`|`all`), `showPaymentModal`, `selectedInvoice`, `paymentData`, `customerInvoices`, `transactions`, `accountingSearch`.

**Data:** Real-time `customer_invoices` ordered by `dateCreated desc`.

**`getFilteredData()`:** filters by month/year/all of `dateCreated`.

**`getStats()`:**
```
totalRevenue   = Σ(customerTotal || total)
pendingPayment = Σ(balanceDue) where status !== 'paid'
collected      = totalRevenue - pendingPayment
invoiceCount   = filtered.length
```

**KPI cards (4-col):**
1. Total Revenue (blue, pie chart icon)
2. Collected (green, with progress bar `collected/total %`)
3. Outstanding (red, alert icon)
4. Record Payment (purple gradient CTA)

**Tables (`grid-cols-1 lg:grid-cols-2`):**
- **Pending Invoices** — search-filtered, top 10
- **Recent Activity** — paid/deposit-paid invoices, "+amount" green

**Payment Modal:**
- Invoice selection (search + dropdown)
- Amount (auto-prefilled with `balanceDue`)
- Method: cash | transfer | card | cheque

**`handlePaymentSubmit(e)`:**
```
paymentAmount = parseFloat(amount)
newPaid       = currentPaid + paymentAmount
newBalance    = currentTotal - newPaid
newStatus     = newBalance <= 1 ? 'paid' : (newPaid > 0 ? 'deposit-paid' : 'pending')
```
Updates `customer_invoices` (`deposit`, `balanceDue`, `paymentStatus`, `lastPaymentDate`, appends to `paymentHistory`). Adds to `transactions` collection.

**Format:** `formatCurrency` MYR via `Intl.NumberFormat('ms-MY')`.

---

## 16. Mechanic Commission Dashboard

### [src/components/MechanicCommissionDashboard.jsx](src/components/MechanicCommissionDashboard.jsx)

**Supports 3 commission formats:**

#### Strategy 1: "Commission 2.0" (current `mechanics: []` array)
```js
invoice.mechanics.forEach(m => {
  totalRevenue += invoice.total
  totalCommission += m.commissionAmount
  if (mechanics.length > 1) teamInvoices += 1
})
```

#### Strategy 2: Legacy team distribution
```js
distributionType === 'team' && commissionDistribution.teamMembers.forEach(member => {
  totalRevenue += invoice.total * (member.percentage / 100)  // pro-rata
  teamCommissions += commissionAmount * member.percentage / 100
})
```

#### Strategy 3: Legacy individual
```js
mechanic = invoice.mechanicName
totalRevenue += invoice.total
totalCommission += invoice.commissionAmount
```

**Mechanic data shape:**
```js
{ id, name, invoices, totalRevenue, totalCommission, paidCommission, pendingCommission,
  invoiceCount, paidInvoices, pendingInvoices, individualCommissions, teamCommissions,
  totalPartsRevenue, totalLabour, teamInvoices }
```

**Date range:** week | month | quarter | year via `getDateRange(timeframe)`.

**Summary cards (3-col):** Total Commissions Paid | Total Revenue | Active Mechanics.

**Table:** Mechanic | Invoices (Total/Paid/Pending) | Commission Type (badges Individual/Team) | Parts Revenue + Labour | Total Commission + Paid line | View Details button.

**Details Modal:** Table per invoice — Date | Invoice # | Customer | Total | Commission Type | Commission | Status.

---

## 17. PDF Generation

### [src/utils/PDFGenerator.js](src/utils/PDFGenerator.js)

Uses `jspdf` + `html2canvas`.

**Static methods:**
- `generateCustomerInvoicePDF(invoice)` → jsPDF doc
- `generateInvoicePDF(invoice)` — alternative for parts/standard
- `downloadInvoicePDF(invoice)` — saves `Invoice_${num}_${date}.pdf`
- `downloadCustomerInvoicePDF(invoice)` — `${type}_${num}_${customer}_${date}.pdf`
- `printInvoice(invoice)` — opens print window
- `printCustomerInvoice(invoice)`

**PDF structure:** Logo (base64) + company name + doc type + invoice # | Customer + Vehicle | Items table (red-600 header bg, alternating rows) | Totals right-aligned | Footer (bank account, generation date).

**Expected invoice fields:** `invoiceNumber`, `dateCreated`, `customerInfo`, `vehicleInfo`, `items[]`, `subtotal`, `discount`, `discountType`, `discountAmount`, `total`, `totalAmount`, `deposit`, `balanceDue`, `notes`, plus quotation-specific (`isQuotation`, `quotationNumber`, `validUntil`, `terms`) and DirectLending (`useDirectLending`, `directLendingAmount`, `customerPayableAmount`).

---

## 18. Performance Optimizer

### [src/utils/PerformanceOptimizer.js](src/utils/PerformanceOptimizer.js)

Static class with cache (Map), 5-min default duration.

**Categories:**
- **Debouncing/Throttling:** `createDebouncedValidator(fn, 300ms)`, `createThrottledStockChecker(fn, 1000ms)`
- **Batching:** `batchOperations(ops, batchSize=10)` — concurrent batches with 50ms delay between, returns `{index, success, result/error, executionTime}`
- **Invoice opt:** `loadInvoiceOptimized(id, fields?)` (cached, field selection), `preloadInvoices(ids)` (batches of 5)
- **Parts opt:** `loadPartsOptimized(searchTerm, activeOnly)` (2-min cache), `createOptimizedSearch(fn)` (250ms debounce, min 2 chars, 1-min cache)
- **UI:** `createOptimizedUIUpdate(fn)` (RAF), `cleanupMemory(data)` (JSON parse/stringify dedupe)
- **Monitoring:** `monitorPerformance(name, asyncFn)` — captures duration, memory delta, success
- **Cache:** `setCache`, `isCacheValid`, `clearExpiredCache`, `clearCache`, `getCacheStats` (entries, memoryUsage, oldest, newest)
- **Analytics:** `storePerformanceMetrics(m)` (localStorage `performance_log`, last 100), `getPerformanceStats()` (totalOps, successRate, avgDuration, slowest, fastest, failureCount, commonErrors)

---

## 19. Error Handling & Debug Components

### 19.1 [ErrorBoundary.jsx](src/components/ErrorBoundary.jsx)

Class component. Catches **render errors only** (not async/network).

**Fallback UI:** Centered error box with red emoji, message, two actions:
- **Reload Application** → `window.location.reload()`
- **Clear Cache & Reload** → clears localStorage + reload

**Dev mode:** Expandable `<details>` showing error stack.

**❌ Does NOT catch:** async errors, event handler errors, network/API errors.

### 19.2 [ContextDebugger.jsx](src/components/ContextDebugger.jsx)

Diagnoses Customer + Transaction context state. Two cards showing context load status, errors with stack trace, or success metrics (counts).

### 19.3 [PerformanceMonitor.jsx](src/components/PerformanceMonitor.jsx)

Modal dashboard for system metrics:
- **Performance:** Total Ops | Success Rate | Avg Duration | Failure Count | Fastest 🚀 | Slowest 🐌 | Common Errors table
- **Cache:** Entries | Memory | Clear button | Age info
- **Recommendations:** Bullet tips
- **Live Memory:** Used/Total/Limit heap with color-coded progress (green <60%, yellow 60–80%, red >80%) — uses `performance.memory` if available

**Auto-refresh:** every 5 sec when open.

---

## 20. Testing Setup

**Framework:** Vitest + jsdom.  
**Config:** [vitest.config.js](vitest.config.js) — `globals: true`, 10s test/hook timeout, `pool: threads` (single thread), coverage thresholds 80% (branches/functions/lines/statements).  
**Path aliases:** `@`, `@components`, `@utils`, `@contexts`, `@hooks`, `@tests`.  
**Setup:** [src/tests/setup.js](src/tests/setup.js) — mocks Firebase config, 15+ Firestore functions, contexts, PDFGenerator, performance API. Suppresses console.log/debug/info; conditionally surfaces warn/error via `VERBOSE_TESTS`.

**Test utilities:** [src/tests/testUtils.js](src/tests/testUtils.js) — `createMockInvoice`, `createMockParts`, `createMockStockChanges`, `createMockConflictAnalysis`, `createMockAuditEntry`, `setupTestEnvironment`, `cleanupTestEnvironment`.

### Test files

#### [InvoiceEditSystem.test.js](src/tests/InvoiceEditSystem.test.js)
- Stock Reconciliation: change calculation, validation, insufficient stock detection
- Conflict Resolution: detection, latest-timestamp strategy
- Atomic Operations: parameter verification (mocked)
- Audit Trail: async recording (mocked)

#### [PerformanceTests.test.js](src/tests/PerformanceTests.test.js)
- Stock recon performance: 1000-item invoice <1s; bulk validate 500 parts <500ms
- Caching: hit faster than miss; expiration after TTL; cleanup releases memory
- Batch ops: 50 ops <500ms; failure handling

#### [UserExperience.test.js](src/tests/UserExperience.test.js)
- Mobile (320px): touch targets ≥44px, font ≥16px, padding ≥12px
- Tablet (768px): 2-col layout, sidebar nav
- Desktop (1200px+): 3-col, full sidebar
- Touch events; iOS zoom prevention (font ≥16px); swipe gestures (50px threshold)

---

## 21. Build / Tooling / Design Tokens

### 21.1 [vite.config.js](vite.config.js)
```js
{ plugins: [react()],
  server: { port: 3000, open: true },
  build: { outDir: 'dist', sourcemap: false, minify: 'terser' } }
```

### 21.2 [tailwind.config.js](tailwind.config.js) — Strict design tokens

**Color palette (Black/Red/White only):**
```js
'primary-black': '#000000', 'primary-red': '#dc2626', 'primary-white': '#ffffff',
'red-dark': '#b91c1c', 'red-light': '#ef4444',
'black-90': 'rgba(0,0,0,0.9)', 'black-75', 'black-50', 'black-25', 'black-10',
'red-10': 'rgba(220,38,38,0.1)'
```

**Spacing:** `xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px, xxl: 48px`

**Font sizes:**
```js
hero: ['3rem', { lineHeight: '1.1', letterSpacing: '-0.5px' }]
section: ['2rem', { lineHeight: '1.2' }]
body: ['1rem', { lineHeight: '1.6' }]
small: ['0.875rem', { lineHeight: '1.5' }]
```

**Shadows:** `subtle: 0 2px 8px rgba(0,0,0,0.1)`, `card: 0 4px 12px rgba(0,0,0,0.1)`.

### 21.3 [src/index.css](src/index.css) — Global styles

**Reset:** `* { box-sizing: border-box; margin: 0; padding: 0; }`. System font stack. `-webkit-text-size-adjust: 100%`, font smoothing.

**Component classes:**
- `.btn-primary` / `.btn-secondary` / `.btn-tertiary` / `.btn-danger` — all min-height 44px
- `.input-field` — 44px min-height, focus ring on primary-red
- `.card` — white bg, subtle border + shadow
- `.table-header` / `.table-cell`
- `.section-title` — 1.25rem bold mb-4
- `.nav-tab` / `.nav-tab.active` (red border + text) / `.nav-tab-compact`
- `.modal-overlay` (fixed inset-0 black-50) / `.modal-content` (bottom sheet on mobile)
- `.loading-spinner` / `.fade-in`

**Animations:** `@keyframes spin`, `@keyframes fadeIn (0.3s ease-out)`.

**Touch:** `@media (hover: none)` removes hover effects.

### 21.4 [postcss.config.js](postcss.config.js)
```js
{ plugins: { tailwindcss: {}, autoprefixer: {} } }
```

---

## 22. Documentation Files Summary

| File | Key Points |
|---|---|
| [PROJECT_REQUIREMENTS.md](PROJECT_REQUIREMENTS.md) | SPA for mechanic shops; 3 sections (Parts, Invoice, History); flexible markup (% or $); real-time inventory; PDF generation |
| [ADD_CUSTOMER_FEATURE.md](ADD_CUSTOMER_FEATURE.md) | Add Customer button on Customers page; required Name+Phone; uses `createCustomer()` |
| [COMPATIBILITY_VALIDATION_STRATEGY.md](COMPATIBILITY_VALIDATION_STRATEGY.md) | 100% backward compat for parts/invoices/history; preserve markup logic, stock validation, PDF visuals, sequential numbering |
| [DESIGN_AESTHETIC_REFERENCE.md](DESIGN_AESTHETIC_REFERENCE.md) | Lucid Motors-inspired: deep black/charcoal, electric blue accents, sans-serif, generous whitespace (40–80px), grid-aligned, 44px touch targets |
| [DIRECTLENDING_FEATURE.md](DIRECTLENDING_FEATURE.md) | Total = Deposit + DirectLending + Customer Payable; new fields `useDirectLending`, `directLendingAmount`, `customerPayableAmount`; purple badge; PDF section |
| [DOCS_CUSTOMER_MANAGEMENT.md](DOCS_CUSTOMER_MANAGEMENT.md) | 14 customer components, 6 contexts, 7 utils; collections: customers, cars, quotations, spare_parts_orders |
| [DOCS_HUMAN_RESOURCE.md](DOCS_HUMAN_RESOURCE.md) | 6 HR components, EmployeeContext, dual auth (Login.jsx + LoginScreen.jsx); **no role-based access control** |
| [DOCS_SPARE_PARTS_MANAGEMENT.md](DOCS_SPARE_PARTS_MANAGEMENT.md) | 7 parts components; PartsContext; useFirebaseData hook; **marked for refactor** |
| [IMPLEMENTATION_QUALITY_CONTROL_FRAMEWORK.md](IMPLEMENTATION_QUALITY_CONTROL_FRAMEWORK.md) | Zero-defect strategy: pre/real-time/post-implementation validation; spec cross-reference |
| [INVOICE_EDITING_IMPLEMENTATION_PHASES.md](INVOICE_EDITING_IMPLEMENTATION_PHASES.md) | 3 phases: Foundation (types, recon, errors) → Context (edit methods, batch) → UI (EditInvoiceModal, ConflictModal) |
| [LEANX_TRANSMISSION_INTEGRATION.md](LEANX_TRANSMISSION_INTEGRATION.md) | Redirect model; env vars: `LEANX_API_HOST=https://api.leanx.io`, `LEANX_AUTH_TOKEN`, collection `Dc-E5317E6652-Lx`; backend POSTs to `/api/v1/merchant/create-bill-page` |
| [ref_UI_STANDARDS.md](ref_UI_STANDARDS.md) | ONEXHUB Premium Design System: slate/gray/blue/red/green/orange palette; **NO emojis** (SVG icons only); 300ms transitions; standardized cards/tables/buttons/badges |
| [STRICT_DESIGN_RULES.md](STRICT_DESIGN_RULES.md) | **5 NON-NEGOTIABLE rules:** Clean & Organized; Minimal & Simplified; World-class UX; Optimized desktop+tablet+mobile (44px touch, 3/2/1-col); Black+Red+White only |
| [SYSTEM_SCALING_MASTER_BLUEPRINT.md](SYSTEM_SCALING_MASTER_BLUEPRINT.md) | External read-only collections (customers, spare_parts_orders, mechanics) + new owned (`customer_invoices`); preserve all parts/invoice features; 3 nav tabs (Spare Parts, Customer, HR) |
| [UI_UX_IMPROVEMENT_PLAN.md](UI_UX_IMPROVEMENT_PLAN.md) | Remove debug emojis/red titles/orange backgrounds from production; standardize tables, section forms with `<h3>` borders, gray totals area; right-align numerics |

---

## 23. Dead / Legacy Files

| File | Status | Notes |
|---|---|---|
| [CustomerInvoiceCreation.jsx](src/components/CustomerInvoiceCreation.jsx) | ✅ **ACTIVE** | Primary route `customer-invoicing` |
| [CustomerInvoiceCreation_BACKUP.jsx](src/components/CustomerInvoiceCreation_BACKUP.jsx) | ❌ DEAD | Only 2-line comment file |
| `CustomerInvoiceCreation.jsx.backup2` | ❌ DEAD | Old backup |
| [CustomerInvoiceCreationFixed.jsx](src/components/CustomerInvoiceCreationFixed.jsx) | ❌ DEAD | Debug variant |
| [CustomerInvoiceCreationSimple.jsx](src/components/CustomerInvoiceCreationSimple.jsx) | ❌ DEAD | Test stub |
| [CustomerInvoiceCreationDebug.jsx](src/components/CustomerInvoiceCreationDebug.jsx) | ❌ DEAD | Context hook test |
| [CustomerInvoiceCreationFirebaseTest.jsx](src/components/CustomerInvoiceCreationFirebaseTest.jsx) | ❌ DEAD | Firebase import test |
| [CustomerInvoiceCreationTest.jsx](src/components/CustomerInvoiceCreationTest.jsx) | ❌ DEAD | Navigation test |
| [QuotationCreation_OLD.jsx](src/components/QuotationCreation_OLD.jsx) | ⚠️ LEGACY | Likely superseded |
| [InvoiceGeneration.jsx](src/components/InvoiceGeneration.jsx) | ⚠️ LEGACY | Old parts-catalog invoicing; route `invoice` still active as backup |
| [InvoiceHistory.jsx](src/components/InvoiceHistory.jsx) | ⚠️ LEGACY | Parts-invoice history; route `history` still active |
| [Navigation.jsx](src/components/Navigation.jsx) | ⚠️ REDUNDANT | Duplicate of Sidebar functionality |
| [AuthContext.jsx](src/context/AuthContext.jsx) | ⚠️ ORPHANED | Defined but App.jsx uses `onAuthStateChanged` directly |

---

## 24. Firebase Collection Schemas (Compiled)

### Read-only (external)
| Collection | Used by | Key fields |
|---|---|---|
| `customers` | CustomerContext, CustomerDatabase | id, name, phone, email, address, ic, bykiAccountCreated |
| `spare_parts_orders` | CustomerContext, FirebaseDataUtils | customerId, customer_id, order_date, orderItems[], totalValue, jobSheetId, jobSheetNumber |
| `mechanics` | DataJoinContext | id, name |
| `byki_status` | RepairOrderContext, CarStatus | repairStatus, vehicleInfo, customerName, lastUpdated, dateCreated |

### Owned (read/write)
| Collection | Used by | Key fields |
|---|---|---|
| `parts` | PartsContext | id, kodProduk, namaProduk, harga, supplier, gambar, specification, unitStock, dateAdded, dateUpdated, lastStockChange |
| `customer_invoices` | InvoiceContext, AccountingDashboard, MechanicCommissionDashboard | invoiceNumber, customerId, customerName, partsOrdered[], laborCharges[], total, deposit, balanceDue, paymentStatus, depositStatus, mechanics[], parentInvoiceId, dateCreated, version, editCount, lastEditSession |
| `quotations` | QuotationCreation | id, quotationNumber, customerId, customerName, partsOrdered, laborCharges, workDescription, vehicleInfo, total, discount, validUntil, dateCreated, status (pending/accepted/rejected/expired), terms, notes |
| `invoices` | InvoiceContext (legacy parts) | id, invoiceNumber, items[], subtotal, totalAmount, customerInfo, version |
| `transactions` | TransactionContext, AccountingDashboard | invoiceId, transactionNumber `TXN-${ts}`, amount, paymentDate, paymentMethod, referenceNumber, status, processedBy, notes |
| `employees` | EmployeeContext | firstName, lastName, email, phone, role, department, hourlyRate, salary, startDate, address, emergencyContact, notes, status (active/inactive), terminationDate, createdAt, updatedAt |
| `attendance` | EmployeeContext, AttendanceTracking | employeeId, date, clockIn (Timestamp), clockOut (Timestamp), status |
| `payroll` | EmployeeContext, PayrollManagement | employeeId, payPeriodStart, payPeriodEnd, totalHours, basePay, overtimePay, commission, grossPay, netPay |
| `leave_requests` | LeaveManagement | employeeId, employeeName, employeeRole, leaveType, startDate, endDate, totalDays, isHalfDay, reason, notes, emergencyContact, workCoverage, attachments[], status (pending/approved/rejected/cancelled), appliedBy, appliedDate, reviewedDate, reviewedBy, adminNotes |
| `performance_reviews` | PerformanceReviews | employeeId, reviewPeriod, overallRating, jobKnowledge, qualityOfWork, productivity, communication, teamwork, punctuality, goals, improvements, comments, reviewDate, createdAt |
| `audit_trail` | AuditTrail | id, action, category, invoiceId, invoiceNumber, timestamp, sessionId, operationId, userId, details{}, userAgent |

---

## 25. Responsiveness Inventory & Pain Points

### 25.1 Tailwind Breakpoints Used
| BP | Pixels | Where |
|---|---|---|
| `sm` | 640 | Header (block/px-6), Sidebar (text-base) |
| `md` | 768 | Most grid layouts (1→2 col, 1→3 col, 1→4 col) |
| `lg` | 1024 | Sidebar mode (drawer→static), Navigation toggle visibility |
| `xl`, `2xl` | 1280, 1536 | **Rarely used** |

### 25.2 Layout Shell

| Element | Mobile | Tablet | Desktop |
|---|---|---|---|
| Header hamburger | Visible | Visible | Hidden (`lg:hidden`) |
| Header subtitle | Hidden | Visible | Visible |
| Header date | Hidden | Visible | Visible |
| Sidebar | Drawer overlay (z-50, slide) | Drawer overlay | Static (`lg:static lg:flex`) |
| Sidebar backdrop | Visible (`bg-black-50 z-40`) | Visible | Hidden |
| Sidebar nav touch targets | **`py-2` (8px) — ❌ below 44px WCAG** | Same | Same |

### 25.3 Per-Component Mobile Pain Points

| Component | Critical Issue | Recommendation |
|---|---|---|
| **All tables** | Use `overflow-x-auto` — horizontal scroll on mobile, no column hiding | Hide non-essential cols with `hidden md:table-cell` OR convert to card layout |
| **CustomerDatabase** | Modal `max-w-md` OK; table cramped <640px | Add column hiding |
| **CustomerInvoiceCreation** | Stats `md:grid-cols-4` too cramped on tablet | Use `md:grid-cols-2 lg:grid-cols-4` |
| **InvoiceHistory** | Edit modal `max-w-6xl` overflows mobile; date filters cramped | Stack edit modal sections; date inputs `flex-col` on mobile |
| **InvoicePreview** | Padding `p-8` excessive on mobile | Use `p-4 sm:p-8` |
| **QuotationCreation** | Parts/labor uses `grid-cols-12` — unreadable on phones | Convert to card list on mobile |
| **CarStatus** | 5-col table breaks on mobile | Hide non-critical columns |
| **PaymentReceipt** | `p-8` excessive on mobile | `p-4 sm:p-8` |
| **PartsManagement** | Text truncation `max-w-[200px]` may hide names | Increase or remove on hover |
| **AttendanceTracking** | Clock In/Out buttons cramped on small phones | `flex-col md:flex-row` for action area |
| **LeaveManagement** | 7-col table cramped; tab nav `space-x-8` overflows | Hide cols + responsive tab spacing `space-x-2 md:space-x-8` |
| **PayrollManagement** | 7-col results table; same tab issue | Same as above |
| **PerformanceReviews** | Review card `flex justify-between` wraps awkwardly | `flex-col sm:flex-row` |
| **AccountingDashboard** | Search `w-48` fixed | `w-full md:w-48` |
| **MechanicCommissionDashboard** | **Best responsiveness** — `flex-col sm:flex-row`, `grid-cols-1 sm:grid-cols-3` | Reference pattern for other components |
| **Modals (all)** | Padding `p-6` tight on 320px screens | `p-3 sm:p-6` |
| **EditInvoiceModal** | `max-w-6xl` huge on mobile | Stack sections vertically |

### 25.4 Common Mobile Issues Summary

1. **Horizontal scroll on all tables** — no responsive column hiding (highest priority)
2. **Modal padding** too generous on small screens
3. **Fixed widths** (`w-48`, `w-64`, `w-72`) on inputs/elements not responsive
4. **`md:grid-cols-4`** cramped on tablets — should step through `md:grid-cols-2 lg:grid-cols-4`
5. **Touch target sizes** in Sidebar nav items below WCAG 44px
6. **Tab navigation** uses `space-x-8` fixed — overflows on narrow screens
7. **`flex justify-between`** on cards causes awkward wrapping on mobile

---

## 26. Critical Issues & Architecture Gaps

### 🔴 Auth & Security
- **No role-based access control** — all authenticated users see all 15 sections
- **AuthContext orphaned** — defined but unused; App.jsx uses Firebase directly
- **Hardcoded password** (`Onex@1234`) in Login.jsx — committed to source
- **Two parallel login systems** with no clear distinction in routing

### 🔴 Code Hygiene
- **8+ legacy/dead/test variants** of CustomerInvoiceCreation
- **Navigation.jsx redundant** with Sidebar.jsx — duplicate state management
- **Debug styling in production** (orange backgrounds, emojis, red titles) per UI_UX_IMPROVEMENT_PLAN.md
- **"Internal Cost Management"** has alarming colors meant only for dev visibility

### 🟡 Functional Gaps
- **`calculateCommission` placeholder** returns 0 in EmployeeContext
- **Employee delete** is soft-delete only (no hard-delete UX)
- **Customer delete** not implemented at all
- **Leave Calendar tab** placeholder (not implemented)
- **Payroll History tab** placeholder
- **AttendanceTracking leave display** form-only, no list of existing requests

### 🟡 Error Handling
- ErrorBoundary catches **render errors only**; no global async error handler
- No retry strategies for network failures beyond useFirebaseData hook
- Many `window.confirm` and `alert()` calls — not WCAG-friendly

### 🟢 Architectural Strengths
- Layered context provider model with clear ordering
- Offline-first with localStorage cache + 1-second timeout
- Atomic invoice edits via Firebase batches
- Comprehensive audit trail
- Conflict resolution with multiple strategies
- Performance optimizer with caching, debouncing, batching, monitoring
- Strict design system (Black/Red/White, 44px touch targets in CSS classes)
- Solid test coverage with proper mocking

---

## End

**Total components catalogued:** 30+  
**Total context providers:** 8  
**Total custom hooks:** 2  
**Total utilities:** 10  
**Total Firestore collections:** 13  
**Total documentation files:** 15  
**Total test files:** 3 + setup + utils  

For mobile/tablet responsiveness work, focus on Section 25 (Responsiveness Inventory). For any future architectural changes, consult Section 26 (Critical Issues).
