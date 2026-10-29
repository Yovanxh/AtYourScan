/**
 * AtYourScan Dynamic UPI URI & Mobile Intent Payment Engine
 * Conforms strictly to NPCI UPI Deep-Linking Specification (v1.6+)
 * Spec: upi://pay?pa={VPA}&pn={NAME}&am={AMOUNT}&cu=INR&tn={NOTE}
 */

/**
 * Validates Virtual Payment Address (VPA) / UPI ID format
 * Format: username@bankhandle (e.g. vanshwaghre-1@okicici, 9876543210@upi)
 * @param {string} vpa
 * @returns {boolean}
 */
export function validateVPA(vpa) {
  if (!vpa || typeof vpa !== 'string') return false;
  // Basic RFC/NPCI VPA format: alphanumeric, periods, dashes, underscores followed by @ and bank handle
  const vpaRegex = /^[\w.-]+@[\w.-]+$/i;
  return vpaRegex.test(vpa.trim());
}

/**
 * Authoritative NPCI UPI Deep-Link Builder
 * Generates an RFC 3986 compliant UPI URI.
 *
 * @param {object} options
 * @param {string} options.upiId - Payee VPA (pa) - Mandatory
 * @param {string} [options.payeeName] - Payee Display Name (pn)
 * @param {number|string} options.amount - Amount in INR (am) - Formatted strictly to 2 decimal places
 * @param {string} [options.currency='INR'] - Currency Code (cu) - Defaults to INR
 * @param {string} [options.transactionNote] - Transaction Note (tn)
 * @returns {string} Fully formed upi://pay URI
 */
export function buildUPIDeepLink({ upiId, payeeName = '', amount, currency = 'INR', transactionNote = '' }) {
  if (!upiId) {
    throw new Error('UPI ID (pa) is mandatory');
  }

  if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
    throw new Error('Valid non-negative amount (am) is mandatory');
  }

  const formattedAmount = (Math.round(Number(amount) * 100) / 100).toFixed(2);
  const params = new URLSearchParams();
  
  params.set('pa', upiId.trim());
  if (payeeName) {
    params.set('pn', payeeName.trim());
  }
  params.set('am', formattedAmount);
  params.set('cu', currency || 'INR');
  if (transactionNote) {
    params.set('tn', transactionNote.trim());
  }

  return `upi://pay?${params.toString()}`;
}

/**
 * High-level helper: Generates dynamic UPI Intent Deep-Link from Order and Venue entities
 * @param {object} order - Order object with id, table_number, total_amount
 * @param {object} venue - Venue object with upi_id, name
 * @returns {string} upi://pay URI
 */
export function generateUPIDeepLink(order, venue) {
  if (!order) throw new Error('Order is required for UPI generation');
  const upiId = venue?.upi_id || 'vanshwaghre-1@okicici';
  const payeeName = venue?.name || 'First Way Cafe';
  const amount = order.total_amount ?? 0;

  return buildUPIDeepLink({
    upiId,
    payeeName,
    amount,
    currency: 'INR'
  });
}

/**
 * Viewport and User-Agent detection to determine if the client environment
 * is a mobile device capable of invoking native UPI app handlers.
 * @returns {boolean}
 */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;

  // 1. User Agent Check
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUA = mobileRegex.test(ua);

  // 2. Viewport Width Check (< 768px typical mobile breakpoint)
  const isMobileWidth = window.innerWidth <= 768;

  // 3. Touch Points Check
  const hasTouch = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);

  return isMobileUA || (isMobileWidth && hasTouch);
}

/**
 * Generate a realistic NPCI Unique Transaction Reference (UTR) for simulation
 * @returns {string} e.g. AYS-UPI-839201948271
 */
export function generateMockUTR() {
  const dateStr = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `AYS-UPI-${dateStr}${randomSuffix}`;
}
