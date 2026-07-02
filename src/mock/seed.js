// Sample data for mock/testing mode. buildSeed(Timestamp) is called once by the
// mock Firestore on first load (persisted afterwards). Reset via window.__mnaMockReset().
export function buildSeed(Timestamp) {
  const now = Date.now()
  const daysAgo = (n) => Timestamp.fromMillis(now - n * 86400000)
  const daysAhead = (n) => Timestamp.fromMillis(now + n * 86400000)
  const iso = (n) => new Date(now - n * 86400000).toISOString()

  const customers = [
    { id: 'cust_ahmad', name: 'Ahmad Faizal bin Rahman', phone: '012-3456789', email: 'ahmad.faizal@example.com', ic: '880101-14-5523', address: '12 Jalan Perindustrian 4, Seksyen 23, 40300 Shah Alam, Selangor', bykiAccountCreated: true, createdAt: iso(120) },
    { id: 'cust_siti', name: 'Siti Nurhaliza binti Omar', phone: '019-8765432', email: 'siti.omar@example.com', ic: '910213-10-6644', address: '8 Jalan SS15/4, 47500 Subang Jaya, Selangor', bykiAccountCreated: true, createdAt: iso(90) },
    { id: 'cust_rajesh', name: 'Rajesh Kumar a/l Suppiah', phone: '016-2233445', email: 'rajesh.k@example.com', ic: '850709-08-5291', address: '21 Lorong Maarof, Bangsar, 59000 Kuala Lumpur', bykiAccountCreated: true, createdAt: iso(60) },
    { id: 'cust_wong', name: 'Wong Wei Ming', phone: '011-99887766', email: 'wm.wong@example.com', ic: '900525-14-5137', address: '3A Jalan PJU 5/1, Kota Damansara, 47810 Petaling Jaya', bykiAccountCreated: true, createdAt: iso(30) },
    { id: 'cust_nurul', name: 'Nurul Aina binti Zainal', phone: '013-4455667', email: 'nurul.aina@example.com', ic: '950818-05-6620', address: '77 Jalan Setia 2, Alam Impian, 40170 Shah Alam', bykiAccountCreated: true, createdAt: iso(14) },
  ]

  const parts = [
    { id: 'part_tc', kodProduk: 'TC-4L60E', namaProduk: 'Torque Converter 4L60E', harga: 850, supplier: 'AutoTrans Supply', unitStock: 12, specification: 'Remanufactured, stall 1800-2000 RPM', gambar: '', dateAdded: iso(100), dateUpdated: iso(10) },
    { id: 'part_atf', kodProduk: 'ATF-DX6', namaProduk: 'ATF Fluid Dexron VI (1L)', harga: 45, supplier: 'Lubetech', unitStock: 60, specification: 'Fully synthetic automatic transmission fluid', gambar: '', dateAdded: iso(100), dateUpdated: iso(5) },
    { id: 'part_vb', kodProduk: 'VB-722.9', namaProduk: 'Valve Body Kit 722.9', harga: 1200, supplier: 'GearPro', unitStock: 4, specification: 'Mercedes 7G-Tronic valve body assembly', gambar: '', dateAdded: iso(80), dateUpdated: iso(20) },
    { id: 'part_sol', kodProduk: 'SOL-6T40', namaProduk: 'Solenoid Pack 6T40', harga: 380, supplier: 'GearPro', unitStock: 9, specification: 'Shift solenoid pack, GM 6T40/6T45', gambar: '', dateAdded: iso(70), dateUpdated: iso(7) },
    { id: 'part_clp', kodProduk: 'CLP-09G', namaProduk: 'Clutch Plate Set 09G', harga: 520, supplier: 'AutoTrans Supply', unitStock: 7, specification: 'VW/Audi 09G/TF-60SN friction plate set', gambar: '', dateAdded: iso(65), dateUpdated: iso(12) },
    { id: 'part_tf', kodProduk: 'TF-01J', namaProduk: 'Transmission Filter 01J', harga: 65, supplier: 'Lubetech', unitStock: 25, specification: 'CVT filter kit with gasket', gambar: '', dateAdded: iso(50), dateUpdated: iso(9) },
    { id: 'part_fw', kodProduk: 'FW-DSG7', namaProduk: 'Dual-Mass Flywheel DSG7', harga: 690, supplier: 'TorqueParts', unitStock: 3, specification: 'DQ200 7-speed dual clutch flywheel', gambar: '', dateAdded: iso(45), dateUpdated: iso(3) },
    { id: 'part_gs', kodProduk: 'GS-ZF6', namaProduk: 'Overhaul Gasket Set ZF6', harga: 150, supplier: 'TorqueParts', unitStock: 18, specification: 'ZF 6HP full reseal gasket & seal kit', gambar: '', dateAdded: iso(40), dateUpdated: iso(6) },
    { id: 'part_os', kodProduk: 'OS-CVT', namaProduk: 'Axle Oil Seal (CVT)', harga: 28, supplier: 'Lubetech', unitStock: 40, specification: 'Left/right axle output seal', gambar: '', dateAdded: iso(35), dateUpdated: iso(4) },
    { id: 'part_bk', kodProduk: 'BK-JF011', namaProduk: 'Bearing Kit JF011E', harga: 240, supplier: 'GearPro', unitStock: 2, specification: 'Nissan/Jatco CVT bearing rebuild kit', gambar: '', dateAdded: iso(28), dateUpdated: iso(2) },
  ]

  const mechanics = [
    { id: 'mech_faizal', name: 'Faizal', active: true, defaultCommissionType: 'percentage', defaultCommissionValue: 5, createdAt: iso(100) },
    { id: 'mech_devan', name: 'Devan', active: true, defaultCommissionType: 'percentage', defaultCommissionValue: 5, createdAt: iso(100) },
    { id: 'mech_hafiz', name: 'Hafiz', active: true, defaultCommissionType: 'percentage', defaultCommissionValue: 4, createdAt: iso(80) },
    { id: 'mech_kumar', name: 'Kumar', active: true, defaultCommissionType: 'fixed', defaultCommissionValue: 50, createdAt: iso(60) },
  ]

  const customer_invoices = [
    {
      id: 'inv_0001', invoiceNumber: 'INV-2026-0001', customerId: 'cust_ahmad', customerName: 'Ahmad Faizal bin Rahman',
      dateCreated: daysAgo(9), documentMode: 'repair',
      vehicleInfo: { make: 'Proton', model: 'X70', year: '2020', plate: 'WXX 1234' }, workDescription: 'Gearbox overhaul — harsh shifting & slipping',
      partsOrdered: [
        { sku: 'CLP-09G', partName: 'Clutch Plate Set 09G', quantity: 1, pricePerUnit: 520, total: 520 },
        { sku: 'GS-ZF6', partName: 'Overhaul Gasket Set ZF6', quantity: 1, pricePerUnit: 150, total: 150 },
        { sku: 'ATF-DX6', partName: 'ATF Fluid Dexron VI (1L)', quantity: 8, pricePerUnit: 45, total: 360 },
      ],
      laborCharges: [{ description: 'Transmission removal & rebuild labour', amount: 1120 }],
      subtotal: 2150, discount: 0, discountType: 'percentage', discountAmount: 0, total: 2150,
      deposit: 500, balanceDue: 1650, paymentStatus: 'deposit-paid', depositStatus: 'paid_offline',
      mechanics: [
        { id: 'mech_faizal', name: 'Faizal', commissionType: 'percentage', commissionValue: 5, commissionAmount: 107.5 },
        { id: 'mech_devan', name: 'Devan', commissionType: 'percentage', commissionValue: 5, commissionAmount: 107.5 },
      ],
      totalPartsSupplierCost: 720, version: 1, createdAt: iso(9),
    },
    {
      id: 'inv_0002', invoiceNumber: 'INV-2026-0002', customerId: 'cust_wong', customerName: 'Wong Wei Ming',
      dateCreated: daysAgo(6), documentMode: 'parts',
      vehicleInfo: { make: '', model: '', year: '', plate: '' }, workDescription: '',
      partsOrdered: [
        { sku: 'SOL-6T40', partName: 'Solenoid Pack 6T40', quantity: 1, pricePerUnit: 380, total: 380 },
        { sku: 'TF-01J', partName: 'Transmission Filter 01J', quantity: 1, pricePerUnit: 65, total: 65 },
        { sku: 'ATF-DX6', partName: 'ATF Fluid Dexron VI (1L)', quantity: 10, pricePerUnit: 45, total: 450 },
      ],
      laborCharges: [],
      subtotal: 895, discount: 0, discountType: 'percentage', discountAmount: 0, total: 895,
      deposit: 895, balanceDue: 0, paymentStatus: 'paid', depositStatus: 'paid_offline',
      mechanics: [], totalPartsSupplierCost: 700, version: 1, createdAt: iso(6),
    },
    {
      id: 'inv_0003', invoiceNumber: 'INV-2026-0003', customerId: 'cust_siti', customerName: 'Siti Nurhaliza binti Omar',
      dateCreated: daysAgo(3), documentMode: 'repair',
      vehicleInfo: { make: 'Honda', model: 'City', year: '2018', plate: 'VBA 8890' }, workDescription: 'CVT judder on acceleration',
      partsOrdered: [
        { sku: 'BK-JF011', partName: 'Bearing Kit JF011E', quantity: 1, pricePerUnit: 240, total: 240 },
        { sku: 'ATF-DX6', partName: 'ATF Fluid Dexron VI (1L)', quantity: 6, pricePerUnit: 45, total: 270 },
      ],
      laborCharges: [{ description: 'CVT service & valve body clean', amount: 770 }],
      subtotal: 1280, discount: 0, discountType: 'percentage', discountAmount: 0, total: 1280,
      deposit: 0, balanceDue: 1280, paymentStatus: 'pending', depositStatus: 'none',
      mechanics: [{ id: 'mech_hafiz', name: 'Hafiz', commissionType: 'percentage', commissionValue: 4, commissionAmount: 51.2 }],
      totalPartsSupplierCost: 360, version: 1, createdAt: iso(3),
    },
    {
      id: 'inv_0004', invoiceNumber: 'INV-2026-0004', customerId: 'cust_rajesh', customerName: 'Rajesh Kumar a/l Suppiah',
      dateCreated: daysAgo(1), documentMode: 'repair',
      vehicleInfo: { make: 'Toyota', model: 'Vios', year: '2019', plate: 'BND 512' }, workDescription: 'ATF flush & filter replacement',
      partsOrdered: [
        { sku: 'TF-01J', partName: 'Transmission Filter 01J', quantity: 1, pricePerUnit: 65, total: 65 },
        { sku: 'ATF-DX6', partName: 'ATF Fluid Dexron VI (1L)', quantity: 5, pricePerUnit: 45, total: 225 },
      ],
      laborCharges: [{ description: 'Flush service labour', amount: 350 }],
      subtotal: 640, discount: 0, discountType: 'percentage', discountAmount: 0, total: 640,
      deposit: 640, balanceDue: 0, paymentStatus: 'paid', depositStatus: 'paid_offline',
      mechanics: [{ id: 'mech_kumar', name: 'Kumar', commissionType: 'fixed', commissionValue: 50, commissionAmount: 50 }],
      totalPartsSupplierCost: 190, version: 1, createdAt: iso(1),
    },
  ]

  const quotations = [
    {
      id: 'quo_0001', quotationNumber: 'QUO-2026-0001', customerId: 'cust_nurul', customerName: 'Nurul Aina binti Zainal',
      dateCreated: daysAgo(2), validUntil: daysAhead(28), documentMode: 'repair',
      vehicleInfo: { make: 'Perodua', model: 'Myvi', year: '2021', plate: 'WA 6621 C' }, workDescription: 'Estimate — transmission mount & fluid service',
      partsOrdered: [{ sku: 'OS-CVT', partName: 'Axle Oil Seal (CVT)', quantity: 2, pricePerUnit: 28, total: 56 }],
      laborCharges: [{ description: 'Diagnostic & service estimate', amount: 300 }],
      subtotal: 356, discount: 0, discountType: 'percentage', discountAmount: 0, total: 356,
      status: 'pending', terms: 'Quotation valid for 30 days from the date of issue.', notes: '', version: 1, createdAt: iso(2),
    },
    {
      id: 'quo_0002', quotationNumber: 'QUO-2026-0002', customerId: 'cust_rajesh', customerName: 'Rajesh Kumar a/l Suppiah',
      dateCreated: daysAgo(12), validUntil: daysAhead(18), documentMode: 'repair',
      vehicleInfo: { make: 'Toyota', model: 'Vios', year: '2019', plate: 'BND 512' }, workDescription: 'Estimate — full ATF flush',
      partsOrdered: [{ sku: 'ATF-DX6', partName: 'ATF Fluid Dexron VI (1L)', quantity: 5, pricePerUnit: 45, total: 225 }],
      laborCharges: [{ description: 'Flush service labour', amount: 350 }],
      subtotal: 575, discount: 0, discountType: 'percentage', discountAmount: 0, total: 575,
      status: 'accepted', terms: 'Quotation valid for 30 days from the date of issue.', notes: 'Converted to INV-2026-0004', version: 1, createdAt: iso(12),
    },
  ]

  const transactions = [
    { id: 'txn_1', invoiceId: 'inv_0001', transactionNumber: 'TXN-1737000001', amount: 500, paymentDate: daysAgo(9), paymentMethod: 'cash', referenceNumber: '', status: 'completed', processedBy: 'staff', notes: 'Deposit' },
    { id: 'txn_2', invoiceId: 'inv_0004', transactionNumber: 'TXN-1737000002', amount: 640, paymentDate: daysAgo(1), paymentMethod: 'transfer', referenceNumber: 'FT12345', status: 'completed', processedBy: 'staff', notes: 'Full payment' },
    { id: 'txn_3', invoiceId: 'inv_0002', transactionNumber: 'TXN-1737000003', amount: 895, paymentDate: daysAgo(6), paymentMethod: 'card', referenceNumber: '', status: 'completed', processedBy: 'staff', notes: 'Parts sale' },
  ]

  return { customers, parts, mechanics, customer_invoices, quotations, transactions, spare_parts_orders: [], byki_status: [] }
}
