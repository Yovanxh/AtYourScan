/**
 * src/api/geminiMenuIngest.js
 * 
 * Gemini Multimodal Menu Ingestion Route Handler with JWT Role Guard.
 * Validates caller's JWT role; non-admin tokens are immediately rejected with 403 Forbidden.
 */

import { verifySSOToken } from '../auth.js';
import { parseMenuPrompt } from '../utils/menuTextParser.js';

export async function handleGeminiMenuIngestRequest(req, store) {
  // 1. Extract Bearer token
  const authHeader = req.headers?.get?.('authorization') || req.headers?.authorization || req.token;
  let callerRole = '';

  if (authHeader) {
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const verification = verifySSOToken(rawToken);
    if (verification.valid && verification.payload) {
      callerRole = (verification.payload.role || '').toLowerCase();
    }
  }

  // Fallback to active store staff if running locally
  if (!callerRole) {
    callerRole = (store?.currentUser?.role || store?.currentUser?.system_role || store?.userRole || store?.currentStaff?.role || '').toLowerCase();
  }

  // 2. Strict Role Validation: Non-admin tokens are immediately rejected with 403 Forbidden
  if (!['admin', 'cafe_admin', 'master_admin', 'owner', 'manager'].includes(callerRole)) {
    return {
      status: 403,
      success: false,
      error: '403 Forbidden: Caller lacks admin authorization for Gemini menu ingestion'
    };
  }

  // 3. Admin authorized: parse menu
  const text = req.body?.text || (typeof req.json === 'function' ? (await req.json()).text : '');
  const parsed = parseMenuPrompt(text);

  return {
    status: 200,
    success: true,
    data: parsed
  };
}
