// Lean.x Payment Integration Service
// NOTE: For Production, this logic should move to a secure backend (Firebase Functions/Vercel API)
// to protect the LEANX_AUTH_TOKEN.

const LEANX_CONFIG = {
  apiHost: 'https://api.leanx.io',
  // Merchant collection + auth token come from .env (VITE_LEANX_*). Both empty in mock/testing.
  // For production, move this call to a secure backend so the token isn't shipped to the browser.
  collectionUuid: import.meta.env.VITE_LEANX_COLLECTION_UUID || '',
  authToken: import.meta.env.VITE_LEANX_AUTH_TOKEN || '',
  redirectBaseUrl: window.location.origin
}

export const LeanxService = {
  /**
   * Generates a payment link for a specific invoice
   * @param {Object} invoice - The invoice object
   * @param {Object} customer - The customer object
   * @param {number|string} [overrideAmount] - Optional specific amount to collect (e.g. deposit or remaining balance)
   * @returns {Promise<{success: boolean, url: string, error: string}>}
   */
  generatePaymentLink: async (invoice, customer, overrideAmount = null) => {
    try {
      console.log('💳 Initiating Lean.x Payment Link Generation for:', invoice.invoiceNumber)

      // 1. Validation
      // If override amount is provided, use it. Otherwise fall back to invoice total.
      let amountToCharge = overrideAmount 
        ? parseFloat(overrideAmount) 
        : parseFloat(invoice.customerTotal || invoice.totalAmount || 0);

      if (isNaN(amountToCharge) || amountToCharge <= 0) {
         // Fallback check if it was just 0
         if (!overrideAmount && (invoice.customerTotal || invoice.totalAmount)) {
            amountToCharge = parseFloat(invoice.customerTotal || invoice.totalAmount);
         } else {
            throw new Error('Invalid payment amount.');
         }
      }

      const amount = amountToCharge.toFixed(2)
      

      // Clean phone number (Remove spaces, dashes)
      const phone = (customer.phone || invoice.customerPhone || '').replace(/[\s-]/g, '')
      
      if (!phone || phone.length < 9) {
        throw new Error('Invalid customer phone number. Required for payment link.')
      }

      // 2. Payload Construction
      const payload = {
        collection_uuid: LEANX_CONFIG.collectionUuid,
        amount: parseFloat(amount),
        invoice_ref: invoice.invoiceNumber,
        // Success URL: Where the user goes after payment
        // We set status to 'verify' so the frontend performs a check on the returned params (e.g. status_id)
        // instead of blindly trusting the link.
        // NOTE: We don't use '?' again here to allow gateway to append its own params cleanly if it uses '?'
        redirect_url: `${LEANX_CONFIG.redirectBaseUrl}/?payment_status=verify&invoice=${invoice.invoiceNumber}&amount=${amount}`,
        // Callback URL: Server-to-server webhook (Optional if just using client redirect)
        callback_url: `${LEANX_CONFIG.apiHost}/api/payment-webhook-placeholder`, 
        full_name: customer.name || invoice.customerName || 'Valued Customer',
        email: customer.email || invoice.customerEmail || 'noemail@example.com',
        phone_number: phone
      }

      console.log('💳 Payload:', payload)

      // 3. API Call
      // IMPORTANT: You must replace 'YOUR_LEANX_AUTH_TOKEN_HERE' at the top of this file
      // with your actual Lean.x Merchant API Token for this to work.
      
      const response = await fetch(`${LEANX_CONFIG.apiHost}/api/v1/merchant/create-bill-page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth-token': LEANX_CONFIG.authToken // Ensure this is set in LEANX_CONFIG
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      console.log('Lean.x Response:', data);

      if (!response.ok) {
        // If Unauthorized/Error, throw to fall back (or handle explicitly)
        console.error('Lean.x API Error:', data);
        throw new Error(data.message || `API Error: ${response.status}`)
      }

      // Robust URL finding (Handling different API versions or wrappers)
      const foundUrl = 
        data.url || 
        data.payment_url || 
        data.redirect_url || 
        data.link ||
        (data.data && (data.data.url || data.data.payment_url || data.data.link));

      // Robust ID finding
      let foundId = data.id || data.uuid || data.bill_id || (data.data && (data.data.id || data.data.uuid));

      // FALLBACK: Extract ID from URL if not found in body
      // Typical formats: .../bills/abcdef123 or ...?id=abcdef123
      if (!foundId && foundUrl) {
          try {
             const parts = foundUrl.split('/');
             const lastPart = parts[parts.length - 1];
             // If last part looks like an ID (alphanumeric, >5 chars)
             if (lastPart && lastPart.length > 5 && !lastPart.includes('?')) {
                 foundId = lastPart;
                 console.log("Extracted ID from URL:", foundId);
             } else {
                 // Try query param
                 const u = new URL(foundUrl);
                 if (u.searchParams.get('id')) foundId = u.searchParams.get('id');
             }
          } catch (e) { console.warn("Could not extract ID from URL", e); }
      }

      if (!foundUrl) {
         // Create a readable error of the keys received to help debugging
         const keys = Object.keys(data).join(', ');
         throw new Error(`Payment generated but URL missing. Keys received: ${keys}`);
      }

      return {
        success: true,
        url: foundUrl, 
        id: foundId, 
        ref: invoice.invoiceNumber
      }

      /* 
      // --- MOCK MODE (For Testing without API Token) ---
      const MOCK_DELAY = 1000
      await new Promise(r => setTimeout(r, MOCK_DELAY))
      
      return {
        success: true,
        isMock: true,
        url: `https://example.com/pay_demo?invoice=${invoice.invoiceNumber}&amount=${amount}`,
        ref: invoice.invoiceNumber
      }
      */

    } catch (error) {
      console.error('❌ Lean.x Link Generation Failed:', error)
      
      // If we failed with the Real API, returning a Mock might be confusing if the user expects real.
      // But for robustness in this testing phase, we will alert the error in the return object.
      return {
        success: false, // Mark as failed so UI knows
        error: error.message || 'Unknown error during link generation',
        // Return a mock URL only if it was a network error (like CORS) to allow UI testing
        // url: error.message.includes('fetch') ? `https://example.com/network_error_demo` : null
      }
    }
  },

  /**
   * Checks the status of a specific bill ID via API
   * @param {string} billId 
   * @returns {Promise<{success: boolean, paid: boolean, status: string}>}
   */
  checkPaymentStatus: async (billId) => {
    try {
        if (!billId) return { success: false, error: 'No ID provided' }
        
        const checkEndpoint = async (url) => {
             const res = await fetch(url, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'auth-token': LEANX_CONFIG.authToken
                }
            })
            if (!res.ok) {
                if (res.status === 404) return null; // Not found here
                throw new Error(`API Error ${res.status}`)
            }
            return res.json()
        }

        // Strategy 1: Standard Public Bill Endpoint
        let data = await checkEndpoint(`${LEANX_CONFIG.apiHost}/api/v1/bills/${billId}`)
        
        // Strategy 2: Merchant Scoped Endpoint (Fallback for some account types)
        if (!data) {
             console.log("Standard endpoint 404. Trying Merchant endpoint...")
             data = await checkEndpoint(`${LEANX_CONFIG.apiHost}/api/v1/merchant/bills/${billId}`)
        }

        // Strategy 3: 'Open' Endpoint (Fallback for legacy)
        if (!data) {
             data = await checkEndpoint(`${LEANX_CONFIG.apiHost}/api/v1/open/bills/${billId}`)
        }

        if (!data) {
            return { success: false, error: 'ID not found on any endpoint', status: 'not_found' }
        }

        // Extraction Logic
        let isPaid = false;
        let statusFound = 'unknown';

        // 1. Direct check
        if (data.paid === true || data.paid === 'true' || data.status === 'paid' || data.state === 'paid' || data.status === 'completed') {
            isPaid = true;
            statusFound = 'paid';
        }
        // 2. Nested 'data' check
        else if (data.data) {
             const d = data.data;
             if (d.paid === true || d.paid === 'true' || d.status === 'paid' || d.state === 'paid' || d.status === 'completed') {
                 isPaid = true;
                 statusFound = 'paid';
             }
        }
        
        return { success: true, paid: isPaid, status: statusFound, fullResponse: data }

    } catch (error) {
        console.warn('Check Status Failed:', error)
        return { success: false, error: error.message }
    }
  }
}
