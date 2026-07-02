import { logoBase64 } from '../assets/logo'

/**
 * Single source of truth for company identity shown on customer-facing documents
 * (invoices, quotations, receipts, PDFs) and payment routing.
 *
 * >>> DUMMY VALUES — replace the items marked TODO with MNA Dynamic Torque's real
 *     details when available. Nothing else in the app hardcodes these anymore.
 */
export const businessConfig = {
  name: 'MNA Dynamic Torque',
  tagline: 'Drive Beyond Limit',
  subtitle: 'Transmission & Driveline Specialist', // TODO confirm wording
  registrationNo: 'SSM 000000000000 (0000000-X)', // TODO real SSM/registration no.
  address: 'No. 0, Jalan Contoh, 00000 Kuala Lumpur, Malaysia', // TODO real address
  phone: '000-000 0000', // TODO real phone
  email: 'hello@mnadynamictorque.com', // TODO real email
  website: '', // TODO optional
  logo: logoBase64,
  currency: 'MYR',
  locale: 'ms-MY',

  // Bank details printed on invoices/PDFs for offline transfers.
  bank: {
    bankName: 'MAYBANK', // TODO real bank
    accountName: 'MNA Dynamic Torque', // TODO real account holder name
    accountNo: '0000 0000 0000', // TODO real account number
  },
}

export default businessConfig
