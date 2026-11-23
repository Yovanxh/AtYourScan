/**
 * src/auth.js
 * Centralized RBAC, Cryptographic Authentication Engine, and Single Sign-On (SSO) Subsystem
 * 
 * Complies with Requirement R1 (Unified Cloud Auth & SSO), R4 (RBAC Boundaries),
 * and R5 (Offline Resilience & Permission Caching).
 */

// --- 1. ROLES DEFINITIONS ---
export const ROLES = Object.freeze({
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  SERVER: 'Server',
  BARTENDER: 'Bartender',
  SUPER_ADMIN: 'Super Admin',
  CAFE_ADMIN: 'cafe_admin',
  MASTER_ADMIN: 'master_admin',
  SHIFT_MANAGER: 'shift_manager'
});

// --- 2. PERMISSIONS TAXONOMY ---
export const PERMISSIONS = Object.freeze({
  // Views & Routing
  POS_VIEW: 'POS_VIEW',
  ORDERS_VIEW: 'orders:view',
  TABLES_VIEW: 'tables:view',
  MENU_VIEW: 'menu:view',
  ANALYTICS_VIEW: 'analytics:view',
  AUDIT_VIEW: 'audit:view',
  PLATFORM_CONTROL_PLANE: 'platform:control_plane',

  // Order Operations
  ORDER_CREATE: 'orders:create',
  ORDER_MODIFY_DRAFT: 'orders:modify_draft',
  KDS_BUMP: 'orders:bump_kds',
  BILL_SETTLE_STANDARD: 'billing:settle_standard',
  TABLE_TRANSFER: 'tables:transfer',

  // High-Risk Sensitive POS Operations (Require Supervisor/Manager Override)
  ORDER_VOID_ACTIVE: 'orders:void',
  ITEM_DELETE_ACTIVE: 'orders:item_delete',
  DISCOUNT_CUSTOM: 'orders:discount',
  TABLE_FORCE_CLEAR: 'tables:force_clear',
  PRICE_ALTER: 'menu:update_price',

  // Catalog & Inventory
  MENU_TOGGLE_AVAILABILITY: 'menu:toggle_availability',
  STOCK_BATCH_INGEST: 'inventory:batch_ingest',
  STOCK_ADJUST: 'inventory:stock_adjust',

  // Hardware & Staff Administration
  TERMINAL_PAIR: 'terminals:pair',
  TERMINAL_CONFIG: 'terminals:manage',
  STAFF_MANAGE: 'staff:manage'
});

// List of operations classified as sensitive; when attempted by non-managers, triggers Manager Override
export const SENSITIVE_PERMISSIONS = Object.freeze([
  PERMISSIONS.ORDER_VOID_ACTIVE,
  'ORDER_VOID_ACTIVE',
  'orders:void',
  PERMISSIONS.ITEM_DELETE_ACTIVE,
  'ITEM_DELETE_ACTIVE',
  'orders:item_delete',
  PERMISSIONS.DISCOUNT_CUSTOM,
  'DISCOUNT_CUSTOM',
  'orders:discount',
  PERMISSIONS.TABLE_FORCE_CLEAR,
  'TABLE_FORCE_CLEAR',
  'tables:force_clear',
  PERMISSIONS.PRICE_ALTER,
  'PRICE_ALTER',
  'menu:update_price'
]);

export function isSensitivePermission(permission) {
  if (!permission) return false;
  return SENSITIVE_PERMISSIONS.includes(permission);
}

// --- 3. ROLE-PERMISSION MATRIX ---
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: ['*'], // Sovereign platform authority across all tenants
  [ROLES.MASTER_ADMIN]: ['*'],
  [ROLES.CAFE_ADMIN]: ['*'],
  [ROLES.ADMIN]: ['*'], // Full administrative authority across all domains

  [ROLES.SHIFT_MANAGER]: [
    PERMISSIONS.POS_VIEW,
    'orders:view',
    'tables:view',
    'menu:view',
    'analytics:view',
    'audit:view',
    'orders:create',
    'orders:modify_draft',
    'orders:bump_kds',
    'billing:settle_standard',
    'tables:transfer',
    'orders:void',
    'orders:item_delete',
    'orders:discount',
    'tables:force_clear',
    'menu:update_price',
    'menu:toggle_availability',
    'inventory:batch_ingest',
    'inventory:stock_adjust',
    'staff:manage',
    'ORDER_CREATE',
    'ORDER_MODIFY_DRAFT',
    'KDS_BUMP',
    'BILL_SETTLE_STANDARD',
    'ORDER_VOID_ACTIVE',
    'ITEM_DELETE_ACTIVE',
    'DISCOUNT_CUSTOM',
    'TABLE_FORCE_CLEAR',
    'PRICE_ALTER',
    'STOCK_BATCH_INGEST',
    'ANALYTICS_VIEW'
  ],

  [ROLES.MANAGER]: [
    PERMISSIONS.POS_VIEW,
    'orders:view',
    'tables:view',
    'menu:view',
    'analytics:view',
    'audit:view',
    'orders:create',
    'orders:modify_draft',
    'orders:bump_kds',
    'billing:settle_standard',
    'tables:transfer',
    'orders:void',
    'orders:item_delete',
    'orders:discount',
    'tables:force_clear',
    'menu:update_price',
    'menu:toggle_availability',
    'inventory:batch_ingest',
    'inventory:stock_adjust',
    'staff:manage',
    // Survey 3 Constant-Style Aliases
    'ORDER_CREATE',
    'ORDER_MODIFY_DRAFT',
    'KDS_BUMP',
    'BILL_SETTLE_STANDARD',
    'ORDER_VOID_ACTIVE',
    'ITEM_DELETE_ACTIVE',
    'DISCOUNT_CUSTOM',
    'TABLE_FORCE_CLEAR',
    'PRICE_ALTER',
    'STOCK_BATCH_INGEST',
    'ANALYTICS_VIEW'
  ],

  [ROLES.CASHIER]: [
    PERMISSIONS.POS_VIEW,
    'orders:view',
    'tables:view',
    'menu:view',
    'orders:create',
    'orders:modify_draft',
    'orders:bump_kds',
    'billing:settle_standard',
    'tables:transfer',
    'menu:toggle_availability',
    // Aliases
    'ORDER_CREATE',
    'ORDER_MODIFY_DRAFT',
    'KDS_BUMP',
    'BILL_SETTLE_STANDARD'
  ],

  [ROLES.SERVER]: [
    PERMISSIONS.POS_VIEW,
    'orders:view',
    'tables:view',
    'menu:view',
    'orders:create',
    'orders:modify_draft',
    'orders:bump_kds',
    // Aliases
    'ORDER_CREATE',
    'ORDER_MODIFY_DRAFT',
    'KDS_BUMP'
  ],

  [ROLES.BARTENDER]: [
    PERMISSIONS.POS_VIEW,
    'orders:view',
    'tables:view',
    'menu:view',
    'orders:create',
    'orders:modify_draft',
    'orders:bump_kds',
    'billing:settle_standard',
    'menu:toggle_availability',
    // Aliases
    'ORDER_CREATE',
    'ORDER_MODIFY_DRAFT',
    'KDS_BUMP',
    'BILL_SETTLE_STANDARD'
  ]
});

// Check whether a given role holds a specific permission
export function hasPermission(role, permission) {
  if (!role || typeof role !== 'string' || !permission || typeof permission !== 'string') return false;
  // Guard against prototype pollution and prototype property collisions (e.g. 'constructor', 'toString')
  if (!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!Array.isArray(perms)) return false;
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  if (PERMISSIONS[permission] && perms.includes(PERMISSIONS[permission])) return true;
  for (const [k, v] of Object.entries(PERMISSIONS)) {
    if ((v === permission && perms.includes(k)) || (k === permission && perms.includes(v))) {
      return true;
    }
  }
  return false;
}

export const checkPermission = hasPermission;

const isTestRuntime = Boolean(
  (typeof globalThis !== 'undefined' && globalThis.IS_TEST_ENV) ||
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
);

// --- 4. NO DEMO / MOCK DATA (ZERO-TOLERANCE POLICY IN APPLICATION RUNTIME) ---
export const SEED_STAFF = Object.freeze(isTestRuntime ? [
  Object.freeze({
    id: 'staff-admin-01',
    name: 'Dev Anand',
    email: 'admin@copperoak.com',
    role: ROLES.ADMIN,
    salt: 'salt-admin-01',
    pin: '1234',
    pin_hash: 'e93a55bf1652dd59963797c72faaed66677e161ae15b09e5a5ccc0b733fa02b3',
    merchant_id: 'm-copperoak-01',
    outlet_scopes: Object.freeze(['*']),
    active: true,
    is_active: true
  }),
  Object.freeze({
    id: 'staff-mgr-01',
    name: 'Anand Kumar',
    email: 'anand@copperoak.com',
    role: ROLES.MANAGER,
    salt: 'salt-mgr-01',
    pin: '9999',
    pin_hash: '82ce389d9340b331ba521280d6d27b62259207fae4fbf6d97ade0811f4196b23',
    merchant_id: 'm-copperoak-01',
    outlet_scopes: Object.freeze(['*']),
    active: true,
    is_active: true
  }),
  Object.freeze({
    id: 'staff-cashier-01',
    name: 'Rohan Verma',
    email: 'rohan@copperoak.com',
    role: ROLES.CASHIER,
    salt: 'salt-cashier-01',
    pin: '1111',
    pin_hash: '2f5f5fb895fd229245b832e998cf6e871fb1def1f6518f0d87ee0e16bb25b4f8',
    merchant_id: 'm-copperoak-01',
    outlet_scopes: Object.freeze(['550e8400-e29b-41d4-a716-446655440000']),
    active: true,
    is_active: true
  }),
  Object.freeze({
    id: 'staff-server-01',
    name: 'Priya Sharma',
    email: 'priya@copperoak.com',
    role: ROLES.SERVER,
    salt: 'salt-server-01',
    pin: '2222',
    pin_hash: '626f5b44b3d2247a7b595696db6ffdd214297da8f244addda111358c508a6503',
    merchant_id: 'm-copperoak-01',
    outlet_scopes: Object.freeze(['550e8400-e29b-41d4-a716-446655440000']),
    active: true,
    is_active: true
  }),
  Object.freeze({
    id: 'staff-bar-01',
    name: 'Alex D’Souza',
    email: 'alex@copperoak.com',
    role: ROLES.BARTENDER,
    salt: 'salt-bar-01',
    pin: '3333',
    pin_hash: '8aa0f65187e0e81fec816d011fae9d8a1d1412ae6aab3cc28012898a11b1e9dc',
    merchant_id: 'm-copperoak-01',
    outlet_scopes: Object.freeze(['550e8400-e29b-41d4-a716-446655440000']),
    active: true,
    is_active: true
  })
] : []);

// Visual styling tokens for role badges in UI
export const ROLE_BADGES = Object.freeze({
  [ROLES.SUPER_ADMIN]: {
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400 shadow-[0_0_8px_#f43f5e]',
    label: 'Master Super-Admin'
  },
  [ROLES.ADMIN]: {
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    dot: 'bg-purple-400 shadow-[0_0_6px_#a855f7]',
    label: 'Admin'
  },
  [ROLES.MANAGER]: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400 shadow-[0_0_6px_#f59e0b]',
    label: 'Manager'
  },
  [ROLES.CASHIER]: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400 shadow-[0_0_6px_#10b981]',
    label: 'Cashier'
  },
  [ROLES.SERVER]: {
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dot: 'bg-sky-400 shadow-[0_0_6px_#38bdf8]',
    label: 'Server'
  },
  [ROLES.BARTENDER]: {
    badge: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    dot: 'bg-fuchsia-400 shadow-[0_0_6px_#e879f9]',
    label: 'Bartender'
  }
});

export function getRoleBadge(role) {
  return ROLE_BADGES[role] || {
    badge: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    dot: 'bg-zinc-500',
    label: role || 'Staff'
  };
}

// --- 5. CRYPTOGRAPHIC CORE ENGINE (SELF-CONTAINED & UNIVERSAL) ---

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Bytes(input) {
  let bytes;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (Array.isArray(input)) {
    bytes = new Uint8Array(input);
  } else if (typeof input === 'string') {
    if (typeof TextEncoder !== 'undefined') {
      bytes = new TextEncoder().encode(input);
    } else {
      const binary = unescape(encodeURIComponent(input));
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
    }
  } else {
    bytes = new Uint8Array(0);
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const byteLen = bytes.length;
  const bitLen = byteLen * 8;

  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  // Pre-allocate 32-bit words buffer with standard FIPS 180-4 padding
  const paddedLen = ((byteLen + 8) >> 6) + 1 << 6;
  const words = new Uint32Array(paddedLen >> 2);

  for (let i = 0; i < byteLen; i++) {
    words[i >> 2] |= bytes[i] << ((3 - (i & 3)) * 8);
  }
  words[byteLen >> 2] |= 0x80 << ((3 - (byteLen & 3)) * 8);

  // Big-endian 64-bit length in bits
  words[words.length - 2] = Math.floor(bitLen / maxWord);
  words[words.length - 1] = bitLen >>> 0;

  for (let j = 0; j < words.length; j += 16) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) {
      w[i] = words[j + i];
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3));
      const s1 = (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10));
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (let i = 0; i < 64; i++) {
      const s1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25));
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + s1 + ch + k[i] + w[i]) | 0;
      const s0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  const rawBytes = [];
  for (let i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      rawBytes.push((hash[i] >> (8 * b)) & 255);
    }
  }
  return rawBytes;
}

export function sha256Sync(str) {
  const bytes = sha256Bytes(str);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  }
  return hex;
}

function hmacSha256Bytes(key, message) {
  const blockSize = 64;
  let keyBytes = typeof key === 'string'
    ? (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(key) : unescape(encodeURIComponent(key)).split('').map(c => c.charCodeAt(0)))
    : key;
  if (!(keyBytes instanceof Uint8Array)) keyBytes = new Uint8Array(keyBytes);

  let msgBytes = typeof message === 'string'
    ? (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(message) : unescape(encodeURIComponent(message)).split('').map(c => c.charCodeAt(0)))
    : message;
  if (!(msgBytes instanceof Uint8Array)) msgBytes = new Uint8Array(msgBytes);

  if (keyBytes.length > blockSize) {
    keyBytes = new Uint8Array(sha256Bytes(keyBytes));
  }

  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes);

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c;
    iKeyPad[i] = paddedKey[i] ^ 0x36;
  }

  const innerMsg = new Uint8Array(blockSize + msgBytes.length);
  innerMsg.set(iKeyPad, 0);
  innerMsg.set(msgBytes, blockSize);

  const innerHash = new Uint8Array(sha256Bytes(innerMsg));

  const outerMsg = new Uint8Array(blockSize + innerHash.length);
  outerMsg.set(oKeyPad, 0);
  outerMsg.set(innerHash, blockSize);

  return sha256Bytes(outerMsg);
}

// Constant-time comparison to prevent timing side channels
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// --- 6. SECURE RANDOM SALT GENERATION ---
export function generateSalt(byteLength = 16) {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let s = '';
  for (let i = 0; i < byteLength * 2; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

// --- 7. PIN HASHING & VERIFICATION ---

export function hashPINSync(pin, salt = '') {
  return sha256Sync(`${salt}:${pin}`);
}

export async function hashPIN(pin, salt = '') {
  const input = `${salt}:${pin}`;
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(input));
      return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fall through to synchronous pure JS implementation
    }
  }
  return hashPINSync(pin, salt);
}

export function verifyPINSync(pin, salt, expectedHash) {
  if (!pin || !expectedHash) return false;
  const computed = hashPINSync(pin, salt);
  return timingSafeEqual(computed, expectedHash);
}

export async function verifyPIN(pin, salt, expectedHash) {
  if (!pin || !expectedHash) return false;
  const computed = await hashPIN(pin, salt);
  return timingSafeEqual(computed, expectedHash);
}

// Staff lookups by PIN
export function findStaffByPINSync(pin, staffRoster = SEED_STAFF) {
  if (!pin) return null;
  for (const staff of staffRoster) {
    // Skip inactive or deactivated staff accounts
    if (staff.active === false || staff.is_active === false) continue;
    if (verifyPINSync(pin, staff.salt, staff.pin_hash)) {
      return staff;
    }
  }
  return null;
}

export async function findStaffByPIN(pin, staffRoster = SEED_STAFF) {
  if (!pin) return null;
  for (const staff of staffRoster) {
    // Skip inactive or deactivated staff accounts
    if (staff.active === false || staff.is_active === false) continue;
    const isValid = await verifyPIN(pin, staff.salt, staff.pin_hash);
    if (isValid) return staff;
  }
  return null;
}

// --- 8. PBKDF2 PASSWORD HASHING (100,000 ITERATIONS, HMAC-SHA-256) ---

export async function hashPassword(password, salt = null) {
  const effectiveSalt = salt || generateSalt(16);
  const enc = new TextEncoder();
  const saltBytes = enc.encode(effectiveSalt);

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hash = Array.from(new Uint8Array(derivedBits))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return { hash, salt: effectiveSalt };
  }

  // Fallback for Node test runners without Web Crypto subtle
  if (typeof window === 'undefined') {
    try {
      const modName = 'node:crypto';
      const nodeCrypto = await import(/* @vite-ignore */ modName);
      return new Promise((resolve, reject) => {
        nodeCrypto.pbkdf2(password, effectiveSalt, 100000, 32, 'sha256', (err, derivedKey) => {
          if (err) return reject(err);
          resolve({ hash: derivedKey.toString('hex'), salt: effectiveSalt });
        });
      });
    } catch {
      throw new Error('No PBKDF2 engine available');
    }
  }
}

export async function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const result = await hashPassword(password, salt);
  return timingSafeEqual(result.hash, expectedHash);
}

// --- 9. BASE64URL ENCODING & DECODING ---

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  let base64;
  if (typeof btoa === 'function') {
    base64 = btoa(binary);
  } else if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(binary, 'binary').toString('base64');
  } else {
    throw new Error('No base64 encoder available');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeStr(str) {
  let base64;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(str, 'utf-8').toString('base64');
  } else if (typeof btoa === 'function') {
    base64 = btoa(unescape(encodeURIComponent(str)));
  } else {
    throw new Error('No base64 encoder available');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeStr(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } else if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(base64)));
  }
  throw new Error('No base64 decoder available');
}

// --- 10. SINGLE SIGN-ON (SSO) SESSION TOKENS ---

export const DEFAULT_SSO_SECRET = 'ays_sso_secret_copperoak_hospitality_2026';

export function createSSOToken(user, outletId = 'venue-default-01', terminalSin = 'SIN-POS-01', secret = DEFAULT_SSO_SECRET) {
  if (!user) throw new Error('User object is required to create SSO token');

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const permissions = user.permissions || ROLE_PERMISSIONS[user.role] || [];

  const payload = {
    iss: 'atyourscan:cloud:auth',
    sub: user.id || user.user_id || 'unknown-user',
    user_id: user.id || user.user_id || 'unknown-user',
    merchant_id: user.merchant_id || 'm-copperoak-01',
    active_outlet_id: outletId,
    outlet_scopes: user.outlet_scopes || ['*'],
    name: user.name || user.full_name || '',
    email: user.email || '',
    role: user.role || ROLES.CASHIER,
    permissions,
    terminal_sin: terminalSin,
    session_type: 'STAFF_SHIFT',
    jti: 'sso_tok_' + Math.random().toString(36).substring(2, 10) + '_' + nowSec,
    iat: nowSec,
    exp: nowSec + (12 * 3600) // 12-hour session lifetime
  };

  const encodedHeader = base64UrlEncodeStr(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeStr(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sigBytes = hmacSha256Bytes(secret, signingInput);
  const signature = base64UrlEncodeBytes(sigBytes);

  return `${signingInput}.${signature}`;
}

export function verifySSOToken(token, secret = DEFAULT_SSO_SECRET) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token missing or invalid type', payload: null };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure', payload: null };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  let header;
  try {
    header = JSON.parse(base64UrlDecodeStr(encodedHeader));
  } catch {
    return { valid: false, error: 'Invalid header JSON', payload: null };
  }

  if (header.alg !== 'HS256') {
    return { valid: false, error: 'Unsupported algorithm', payload: null };
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSigBytes = hmacSha256Bytes(secret, signingInput);
  const expectedSignature = base64UrlEncodeBytes(expectedSigBytes);

  if (!timingSafeEqual(signature, expectedSignature)) {
    return { valid: false, error: 'Invalid signature', payload: null };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeStr(encodedPayload));
  } catch {
    return { valid: false, error: 'Invalid payload JSON', payload: null };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSec) {
    return { valid: false, error: 'Token expired', payload };
  }

  return { valid: true, payload };
}

// --- 11. MULTI-OUTLET SCOPE ENFORCEMENT ---

/**
 * Determine whether a staff member or SSO token payload can access a specific outlet.
 * Supports wildcard ('*') and explicit outlet UUID arrays.
 * Rejects null/undefined inputs and deactivated staff accounts.
 *
 * @param {object} staffOrUser - Staff record or decoded SSO token payload
 * @param {string} outletId - Target outlet/venue UUID
 * @returns {boolean}
 */
export function canAccessOutlet(staffOrUser, outletId) {
  if (!staffOrUser || typeof staffOrUser !== 'object') return false;
  if (!outletId || typeof outletId !== 'string') return false;
  // Strictly reject deactivated staff
  if (staffOrUser.active === false || staffOrUser.is_active === false) return false;

  const scopes = Array.isArray(staffOrUser.outlet_scopes) ? staffOrUser.outlet_scopes : [];
  if (scopes.includes('*')) return true;
  return scopes.includes(outletId);
}

/**
 * Validate that an SSO token payload possesses authorization for the target outlet.
 * Semantic alias for canAccessOutlet for use in SSO token verification pipelines.
 *
 * @param {object} tokenPayload - Decoded SSO token payload
 * @param {string} outletId - Target outlet/venue UUID
 * @returns {boolean}
 */
export function validateOutletScope(tokenPayload, outletId) {
  return canAccessOutlet(tokenPayload, outletId);
}

// --- 12. LOCAL OFFLINE CREDENTIAL & SESSION CACHING HELPERS ---

export function getCachedStaff(fallback = SEED_STAFF) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem('ays_cached_staff');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveCachedStaff(staffList) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem('ays_cached_staff', JSON.stringify(staffList));
    return true;
  } catch {
    return false;
  }
}

export function getCachedSession() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const token = localStorage.getItem('ays_sso_session');
    if (!token) return null;
    const verification = verifySSOToken(token);
    return verification.valid ? verification.payload : null;
  } catch {
    return null;
  }
}

export function saveCachedSession(token) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem('ays_sso_session', token);
    return true;
  } catch {
    return false;
  }
}

export function clearCachedSession() {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.removeItem('ays_sso_session');
    return true;
  } catch {
    return false;
  }
}

// --- 13. SUPER-ADMIN GLOBAL PLATFORM CONTROL PLANE ENGINE ---

/**
 * Sovereign Platform Master Super-Admin Accounts Registry
 * No preloaded or hardcoded accounts; created and provisioned dynamically by the platform owner.
 */
export let SUPER_ADMIN_ACCOUNTS = [];

/**
 * Factory to create a cryptographically secured Super-Admin Account record
 * @param {{ name: string, email: string, pin: string, id?: string }} params
 * @returns {object} Super-Admin account record
 */
export function createSuperAdminAccountRecord({ name = '', email = '', pin = '', id = null } = {}) {
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPin = String(pin || '').trim();
  if (!cleanName) throw new Error('Master Super-Admin name is required');
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Valid Master Super-Admin email is required');
  if (cleanPin.length < 4 || cleanPin.length > 8) throw new Error('Sovereign Master PIN must be between 4 and 8 digits');

  const salt = generateSalt(16);
  const pin_hash = hashPINSync(cleanPin, salt);
  const accountId = id || 'super-admin-' + Math.random().toString(36).substring(2, 9);

  return {
    id: accountId,
    user_id: accountId,
    name: cleanName,
    email: cleanEmail,
    role: ROLES.SUPER_ADMIN,
    system_role: 'super_admin',
    is_super_admin: true,
    salt,
    pin_hash,
    merchant_id: '*',
    outlet_scopes: ['*'],
    active: true,
    is_active: true,
    created_at: new Date().toISOString()
  };
}

/**
 * Check if a given staff, user, or decoded JWT payload is a verified Master Super-Admin
 * @param {object} userOrStaff
 * @returns {boolean}
 */
export function isSuperAdmin(userOrStaff) {
  if (!userOrStaff || typeof userOrStaff !== 'object') return false;
  if (userOrStaff.active === false || userOrStaff.is_active === false) return false;

  // Strict tenant profile separation: Cafe Admins and Shift Staff are NEVER platform Super-Admins
  if (userOrStaff.cafe_id || userOrStaff.role === 'cafe_admin' || userOrStaff.system_role === 'cafe_admin') {
    return false;
  }
  if (
    userOrStaff.system_role === 'super_admin' || 
    userOrStaff.system_role === 'master_admin' || 
    userOrStaff.role === ROLES.SUPER_ADMIN || 
    userOrStaff.role === ROLES.MASTER_ADMIN || 
    userOrStaff.is_super_admin === true
  ) {
    return true;
  }

  // 2. JWT app_metadata or user_metadata claims
  if (userOrStaff.app_metadata && (userOrStaff.app_metadata.system_role === 'super_admin' || userOrStaff.app_metadata.system_role === 'master_admin')) {
    return true;
  }
  if (userOrStaff.user_metadata && (userOrStaff.user_metadata.system_role === 'super_admin' || userOrStaff.user_metadata.system_role === 'master_admin')) {
    return true;
  }

  return false;
}

// Master Bootstrap Secret Passkey for Genesis Registration (/signup?type=master)
export const MASTER_BOOTSTRAP_SECRET = 
  (typeof process !== 'undefined' && process.env?.MASTER_BOOTSTRAP_SECRET) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MASTER_BOOTSTRAP_SECRET) ||
  'ATYOURSCAN_MASTER_GENESIS_2026';

export function hashPasswordSync(password, salt) {
  return hashPINSync(password, salt);
}

export function verifyPasswordSync(password, salt, hash) {
  return verifyPINSync(password, salt, hash);
}

/**
 * Synchronous lookup of Super-Admin by PIN
 */
export function findSuperAdminByPINSync(pin, accounts = SUPER_ADMIN_ACCOUNTS) {
  if (!pin || !Array.isArray(accounts)) return null;
  for (const admin of accounts) {
    if (admin.active === false || admin.is_active === false) continue;
    if (verifyPINSync(pin, admin.salt, admin.pin_hash)) {
      return admin;
    }
  }
  return null;
}

/**
 * Asynchronous lookup of Super-Admin by PIN
 */
export async function findSuperAdminByPIN(pin, accounts = SUPER_ADMIN_ACCOUNTS) {
  if (!pin || !Array.isArray(accounts)) return null;
  for (const admin of accounts) {
    if (admin.active === false || admin.is_active === false) continue;
    const isValid = await verifyPIN(pin, admin.salt, admin.pin_hash);
    if (isValid) return admin;
  }
  return null;
}

/**
 * Generate a cryptographically signed Super-Admin Platform JWT token
 * @param {object} user
 * @param {string} secret
 * @returns {string} JWT Token
 */
export function createSuperAdminToken(user, secret = DEFAULT_SSO_SECRET) {
  if (!isSuperAdmin(user)) {
    throw new Error('Unauthorized: Only verified Super-Admin accounts can generate platform tokens');
  }

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const nowSec = Math.floor(Date.now() / 1000);

  const payload = {
    iss: 'atyourscan:platform:control_plane',
    sub: user.id || user.user_id || 'super-admin',
    user_id: user.id || user.user_id || 'super-admin',
    email: user.email || 'superadmin@atyourscan.com',
    name: user.name || 'Platform Super-Admin',
    system_role: 'super_admin',
    is_super_admin: true,
    role: ROLES.SUPER_ADMIN,
    app_metadata: {
      system_role: 'super_admin',
      provider: 'supabase'
    },
    user_metadata: {
      system_role: 'super_admin'
    },
    merchant_id: '*',
    active_outlet_id: '*',
    outlet_scopes: ['*'],
    permissions: ['*'],
    session_type: 'SUPER_ADMIN_CONTROL_PLANE',
    jti: 'super_tok_' + Math.random().toString(36).substring(2, 10) + '_' + nowSec,
    iat: nowSec,
    exp: nowSec + (8 * 3600) // 8 hours
  };

  const encodedHeader = base64UrlEncodeStr(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeStr(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sigBytes = hmacSha256Bytes(secret, signingInput);
  const signature = base64UrlEncodeBytes(sigBytes);

  return `${signingInput}.${signature}`;
}

/**
 * Verify a Super-Admin Platform JWT token
 * @param {string} token
 * @param {string} secret
 * @returns {{ valid: boolean, payload: object | null, error?: string }}
 */
export function verifySuperAdminToken(token, secret = DEFAULT_SSO_SECRET) {
  const result = verifySSOToken(token, secret);
  if (!result.valid) return result;

  if (!isSuperAdmin(result.payload)) {
    return { valid: false, error: 'Forbidden: Token lacks Super-Admin claims', payload: result.payload };
  }

  return result;
}

