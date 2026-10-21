/**
 * tests/adversarial_m1_security.test.mjs
 * Milestone 1 Adversarial Security & Edge Case Verification Suite
 * Challenger 1 (Adversarial Security & Edge Case Challenger)
 *
 * Exhaustively stress-tests:
 * 1. Cryptographic Boundary Edge Cases (SSO JWT forgery, alg 'none' attacks, payload tampering,
 *    expired tokens, signature corruption, variable/extreme salt formats, timing side-channel safety)
 * 2. PIN Validation Edge Cases (empty strings, whitespace, alphanumeric, negative numbers,
 *    float strings, buffer overflow attempts, non-string types, non-existent / mismatched staff IDs)
 * 3. RBAC Security Boundaries & Role Escalation Prevention (exhaustive role-permission matrix,
 *    sensitive permission lockout for Cashier/Server/Bartender, Manager Override spoofing resilience,
 *    terminal pairing privilege enforcement, prototype pollution resilience)
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setupTestEnvironment, createTestSuite } from './helpers.mjs';
import {
  ROLES,
  PERMISSIONS,
  SENSITIVE_PERMISSIONS,
  ROLE_PERMISSIONS,
  SEED_STAFF,
  hashPIN,
  hashPINSync,
  verifyPIN,
  verifyPINSync,
  findStaffByPIN,
  findStaffByPINSync,
  hashPassword,
  verifyPassword,
  hasPermission,
  isSensitivePermission,
  createSSOToken,
  verifySSOToken,
  timingSafeEqual,
  generateSalt,
  DEFAULT_SSO_SECRET
} from '../src/auth.js';
import { store } from '../src/store.js';

setupTestEnvironment();

export const suite = createTestSuite('M1 Challenger 1: Adversarial Security & Boundary Test Suite');

function resetStore() {
  store.resetDemoData();
}

// ============================================================================
// 1. CRYPTOGRAPHIC BOUNDARY EDGE CASES (ADV-CRYPTO)
// ============================================================================

suite.test('ADV-CRYPTO-01: Token signed with unauthorized secret fails verification', () => {
  const user = SEED_STAFF.find(s => s.role === ROLES.CASHIER);
  const attackerSecret = 'attacker_malicious_secret_key_666';
  const forgedToken = createSSOToken(user, 'venue-blr-01', 'SIN-POS-01', attackerSecret);

  const verification = verifySSOToken(forgedToken);
  assert.equal(verification.valid, false, 'Token signed with foreign secret must be rejected');
  assert.equal(verification.error, 'Invalid signature');
  assert.equal(verification.payload, null);
});

suite.test('ADV-CRYPTO-02: Alg "none" and unsupported algorithm header spoofing rejected', () => {
  const user = SEED_STAFF.find(s => s.role === ROLES.CASHIER);
  const nowSec = Math.floor(Date.now() / 1000);

  // Attack 1: alg "none"
  const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: ROLES.ADMIN, // Escalation attempt
    exp: nowSec + 3600
  })).toString('base64url');
  const noneToken = `${headerNone}.${payload}.`;

  const resNone = verifySSOToken(noneToken);
  assert.equal(resNone.valid, false, 'Algorithm "none" must be rejected');
  assert.equal(resNone.error, 'Unsupported algorithm');

  // Attack 2: alg "RS256" (asymmetric spoof attempt)
  const headerRS = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const rsToken = `${headerRS}.${payload}.fakesignature123`;
  const resRS = verifySSOToken(rsToken);
  assert.equal(resRS.valid, false, 'Algorithm "RS256" must be rejected');
  assert.equal(resRS.error, 'Unsupported algorithm');

  // Attack 3: alg "HS512"
  const headerHS512 = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
  const hs512Token = `${headerHS512}.${payload}.fakesignature123`;
  const resHS512 = verifySSOToken(hs512Token);
  assert.equal(resHS512.valid, false, 'Algorithm "HS512" must be rejected');
});

suite.test('ADV-CRYPTO-03: Header tampering with invalid JSON or non-object fails gracefully', () => {
  const user = SEED_STAFF.find(s => s.role === ROLES.CASHIER);
  const token = createSSOToken(user);
  const parts = token.split('.');

  // Malformed Base64/JSON in header
  const badHeaderToken = `not_a_valid_json_header.${parts[1]}.${parts[2]}`;
  const res1 = verifySSOToken(badHeaderToken);
  assert.equal(res1.valid, false);
  assert.equal(res1.error, 'Invalid header JSON');

  // Truncated header
  const truncatedHeader = Buffer.from('{"alg":').toString('base64url');
  const res2 = verifySSOToken(`${truncatedHeader}.${parts[1]}.${parts[2]}`);
  assert.equal(res2.valid, false);
  assert.equal(res2.error, 'Invalid header JSON');
});

suite.test('ADV-CRYPTO-04: Payload modification (privilege escalation & identity spoofing) breaks HMAC', () => {
  const cashier = SEED_STAFF.find(s => s.role === ROLES.CASHIER);
  const token = createSSOToken(cashier);
  const [headerB64, payloadB64, sigB64] = token.split('.');

  // Decoded payload inspection
  const originalPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  assert.equal(originalPayload.role, ROLES.CASHIER);

  // Attack 1: Escalate role to Admin
  const forgedAdminPayload = { ...originalPayload, role: ROLES.ADMIN, permissions: ['*'] };
  const forgedAdminB64 = Buffer.from(JSON.stringify(forgedAdminPayload)).toString('base64url');
  const attackToken1 = `${headerB64}.${forgedAdminB64}.${sigB64}`;
  const verify1 = verifySSOToken(attackToken1);
  assert.equal(verify1.valid, false, 'Tampered role payload must fail signature check');
  assert.equal(verify1.error, 'Invalid signature');

  // Attack 2: Change user ID / sub
  const forgedUserPayload = { ...originalPayload, sub: 'staff-admin-01', user_id: 'staff-admin-01' };
  const forgedUserB64 = Buffer.from(JSON.stringify(forgedUserPayload)).toString('base64url');
  const attackToken2 = `${headerB64}.${forgedUserB64}.${sigB64}`;
  const verify2 = verifySSOToken(attackToken2);
  assert.equal(verify2.valid, false, 'Tampered sub payload must fail signature check');

  // Attack 3: Corrupt JSON in payload
  const badPayloadB64 = Buffer.from('{"unclosed_json: true').toString('base64url');
  const attackToken3 = `${headerB64}.${badPayloadB64}.${sigB64}`;
  const verify3 = verifySSOToken(attackToken3);
  assert.equal(verify3.valid, false);
});

suite.test('ADV-CRYPTO-05: Expired timestamps (past, boundary zero, skew) strictly fail verification', () => {
  const user = SEED_STAFF.find(s => s.role === ROLES.SERVER);
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. Expired 10 seconds ago
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadExpired = {
    sub: user.id,
    role: user.role,
    iat: nowSec - 7200,
    exp: nowSec - 10
  };
  const pExpiredB64 = Buffer.from(JSON.stringify(payloadExpired)).toString('base64url');
  const sigExpired = crypto.createHmac('sha256', DEFAULT_SSO_SECRET)
    .update(`${headerB64}.${pExpiredB64}`)
    .digest('base64url');
  const tokenExpired = `${headerB64}.${pExpiredB64}.${sigExpired}`;

  const resExpired = verifySSOToken(tokenExpired);
  assert.equal(resExpired.valid, false, 'Expired token must fail');
  assert.equal(resExpired.error, 'Token expired');

  // 2. Expired 1 second ago (tight boundary)
  const payloadBoundary = { ...payloadExpired, exp: nowSec - 1 };
  const pBoundaryB64 = Buffer.from(JSON.stringify(payloadBoundary)).toString('base64url');
  const sigBoundary = crypto.createHmac('sha256', DEFAULT_SSO_SECRET)
    .update(`${headerB64}.${pBoundaryB64}`)
    .digest('base64url');
  const tokenBoundary = `${headerB64}.${pBoundaryB64}.${sigBoundary}`;

  const resBoundary = verifySSOToken(tokenBoundary);
  assert.equal(resBoundary.valid, false, 'Token expiring 1s ago must fail');
  assert.equal(resBoundary.error, 'Token expired');

  // 3. Valid future token
  const payloadFuture = { ...payloadExpired, exp: nowSec + 3600 };
  const pFutureB64 = Buffer.from(JSON.stringify(payloadFuture)).toString('base64url');
  const sigFuture = crypto.createHmac('sha256', DEFAULT_SSO_SECRET)
    .update(`${headerB64}.${pFutureB64}`)
    .digest('base64url');
  const tokenFuture = `${headerB64}.${pFutureB64}.${sigFuture}`;

  const resFuture = verifySSOToken(tokenFuture);
  assert.equal(resFuture.valid, true, 'Token valid 1hr in future must succeed');
});

suite.test('ADV-CRYPTO-06: Malformed token structure (dot counts, empty string, non-strings)', () => {
  const malformedInputs = [
    '',
    null,
    undefined,
    12345,
    {},
    [],
    'singlepartstringwithoutdots',
    'partone.parttwo', // 2 parts
    'partone.parttwo.partthree.partfour', // 4 parts
    '..', // only dots
    'header..signature', // empty payload
    '.payload.signature', // empty header
    'header.payload.', // empty signature
    'header.payload.invalid_signature_characters###$$$'
  ];

  for (const input of malformedInputs) {
    const res = verifySSOToken(input);
    assert.equal(res.valid, false, `Input "${String(input)}" must be rejected safely without throwing`);
    assert.equal(res.payload, null);
  }
});

suite.test('ADV-CRYPTO-07: Signature bit flip and truncation tampering tests', () => {
  const user = SEED_STAFF.find(s => s.role === ROLES.MANAGER);
  const token = createSSOToken(user);
  const [headerB64, payloadB64, sigB64] = token.split('.');

  // 1. Single character substitution in signature
  const flippedSig = sigB64.slice(0, -1) + (sigB64.slice(-1) === 'a' ? 'b' : 'a');
  const flippedToken = `${headerB64}.${payloadB64}.${flippedSig}`;
  assert.equal(verifySSOToken(flippedToken).valid, false, 'Bit flip in signature must fail');

  // 2. Truncated signature
  const truncatedSig = sigB64.slice(0, 16);
  const truncatedToken = `${headerB64}.${payloadB64}.${truncatedSig}`;
  assert.equal(verifySSOToken(truncatedToken).valid, false, 'Truncated signature must fail');

  // 3. Appended signature
  const extendedToken = `${headerB64}.${payloadB64}.${sigB64}EXTRA`;
  assert.equal(verifySSOToken(extendedToken).valid, false, 'Extended signature must fail');
});

suite.test('ADV-CRYPTO-08: Constant-time comparison (timingSafeEqual) robustness against adversarial inputs', () => {
  // Correct equality
  assert.equal(timingSafeEqual('abcdef123456', 'abcdef123456'), true);
  
  // Unequal characters same length
  assert.equal(timingSafeEqual('abcdef123456', 'abcdef123457'), false);
  
  // Unequal length
  assert.equal(timingSafeEqual('abcdef123456', 'abcdef12345'), false);
  assert.equal(timingSafeEqual('abcdef123456', 'abcdef1234567'), false);

  // Type mismatch and edge inputs
  assert.equal(timingSafeEqual(null, 'abc'), false);
  assert.equal(timingSafeEqual('abc', null), false);
  assert.equal(timingSafeEqual(undefined, undefined), false);
  assert.equal(timingSafeEqual(12345, 12345), false);
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual('', 'a'), false);
});

suite.test('ADV-CRYPTO-09: Salt boundary stress testing & UTF-8 divergence vulnerability demonstration', async () => {
  const pin = '4321';

  // 1. Empty salt
  const hashEmpty = await hashPIN(pin, '');
  assert.equal(typeof hashEmpty, 'string');
  assert.equal(hashEmpty.length, 64);
  assert.equal(await verifyPIN(pin, '', hashEmpty), true);

  // 2. Special characters and colons in salt
  const colonSalt = 'salt:with:multiple:colons:and!@#$%^&*()';
  const hashColon = await hashPIN(pin, colonSalt);
  assert.equal(await verifyPIN(pin, colonSalt, hashColon), true);
  assert.equal(await verifyPIN(pin, 'wrong:salt', hashColon), false);

  // 3. 4KB large salt buffer stress test
  const largeSalt = 's'.repeat(4096);
  const hashLarge = await hashPIN(pin, largeSalt);
  assert.equal(hashLarge.length, 64);
  assert.equal(await verifyPIN(pin, largeSalt, hashLarge), true);

  // 4. Multi-byte Unicode & emoji salt (Verified: sha256Sync produces identical UTF-8 digest to Web Crypto subtle)
  const emojiSalt = 'bistro_salt_🌶️🍕🍛_Bengaluru_2026';
  const asyncHash = await hashPIN(pin, emojiSalt);
  const syncHash = hashPINSync(pin, emojiSalt);
  
  assert.equal(
    asyncHash,
    syncHash,
    'Synchronous sha256Sync and async Web Crypto hashPIN must produce bit-exact identical digests for multi-byte UTF-8 salts'
  );
  assert.equal(
    verifyPINSync(pin, emojiSalt, asyncHash),
    true,
    'verifyPINSync must verify successfully with multi-byte UTF-8 salt'
  );
});

suite.test('ADV-CRYPTO-10: PBKDF2 edge cases & verifyPassword empty string falsy check', async () => {
  // Empty password PBKDF2 derivation succeeds
  const emptyRes = await hashPassword('');
  assert.equal(emptyRes.hash.length, 64);

  // EMPIRICAL FINDING: verifyPassword checks !password, which rejects empty string despite valid PBKDF2 hash
  const verifyEmpty = await verifyPassword('', emptyRes.salt, emptyRes.hash);
  assert.equal(
    verifyEmpty,
    false,
    'EMPIRICAL FINDING: verifyPassword(!password) treats empty string as invalid rather than verifying against PBKDF2 hash'
  );

  // Long password (1024 characters)
  const longPass = 'P@ssw0rd!'.repeat(120);
  const longRes = await hashPassword(longPass);
  assert.equal(longRes.hash.length, 64);
  const verifyLong = await verifyPassword(longPass, longRes.salt, longRes.hash);
  assert.equal(verifyLong, true);

  // Password verification rejects null/undefined inputs
  assert.equal(await verifyPassword(null, longRes.salt, longRes.hash), false);
  assert.equal(await verifyPassword(longPass, null, longRes.hash), false);
  assert.equal(await verifyPassword(longPass, longRes.salt, null), false);
});

// ============================================================================
// 2. PIN VALIDATION EDGE CASES (ADV-PIN)
// ============================================================================

suite.test('ADV-PIN-01: Empty, whitespace-only, and non-string PINs rejected by loginWithPIN', async () => {
  resetStore();

  const invalidInputs = [
    '',
    '    ',
    '\t\n',
    null,
    undefined,
    1111, // numeric type instead of string
    {},
    [],
    true,
    false,
    NaN
  ];

  for (const input of invalidInputs) {
    const res = await store.loginWithPIN(input);
    assert.equal(res.success, false, `Input "${String(input)}" must fail loginWithPIN`);
    assert.equal(res.error, 'PIN must be 4 to 6 numeric digits');
  }
});

suite.test('ADV-PIN-02: Non-numeric, alphanumeric, and special character PINs rejected', async () => {
  resetStore();

  const nonNumericPINs = [
    'abcd',
    '123a',
    'a123',
    '111!',
    '12.34',
    '12,34',
    '1234\0',
    '12 34', // internal space
    '1 2 3 4',
    '123e4', // scientific notation
    '0x1234' // hex notation
  ];

  for (const pin of nonNumericPINs) {
    const res = await store.loginWithPIN(pin);
    assert.equal(res.success, false, `PIN "${pin}" must be rejected as non-numeric`);
    assert.equal(res.error, 'PIN must be 4 to 6 numeric digits');
  }
});

suite.test('ADV-PIN-03: Negative numbers and out-of-boundary length PINs rejected', async () => {
  resetStore();

  const outOfBoundsPINs = [
    '-111',   // 4 chars including minus
    '-1111',  // 5 chars including minus
    '-9999',
    '1',      // 1 digit
    '12',     // 2 digits
    '123',    // 3 digits
    '1234567', // 7 digits
    '12345678', // 8 digits
    '123456789012' // 12 digits
  ];

  for (const pin of outOfBoundsPINs) {
    const res = await store.loginWithPIN(pin);
    assert.equal(res.success, false, `PIN "${pin}" must be rejected by boundary rules`);
    assert.equal(res.error, 'PIN must be 4 to 6 numeric digits');
  }
});

suite.test('ADV-PIN-04: Buffer overflow & injection stress attempts rejected cleanly', async () => {
  resetStore();

  // 10,000 digit numeric string (DoS length attempt)
  const hugeNumericPIN = '9'.repeat(10000);
  const resHuge = await store.loginWithPIN(hugeNumericPIN);
  assert.equal(resHuge.success, false);
  assert.equal(resHuge.error, 'PIN must be 4 to 6 numeric digits');

  // SQL Injection strings
  const sqlInjectionPINs = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' UNION SELECT * FROM users --",
    "1234' OR 1=1--"
  ];

  for (const sql of sqlInjectionPINs) {
    const res = await store.loginWithPIN(sql);
    assert.equal(res.success, false);
    assert.equal(res.error, 'PIN must be 4 to 6 numeric digits');
  }

  // Prototype pollution string attempts
  const protoPINs = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'];
  for (const p of protoPINs) {
    const res = await store.loginWithPIN(p);
    assert.equal(res.success, false);
    assert.equal(res.error, 'PIN must be 4 to 6 numeric digits');
  }
});

suite.test('ADV-PIN-05: Non-existent staffId and mismatched staffId targeting rejected', async () => {
  resetStore();

  // Cashier Rohan's PIN is 1111, id is 'staff-cashier-01'
  // Admin Dev Anand's PIN is 1234, id is 'staff-admin-01'

  // Attempt 1: Valid Cashier PIN '1111' but with non-existent staffId
  const res1 = await store.loginWithPIN('1111', 'staff-ghost-uuid-999');
  assert.equal(res1.success, false, 'Non-existent staffId must fail');
  assert.equal(res1.error, 'Invalid PIN');

  // Attempt 2: Valid Cashier PIN '1111' but targeting Admin staffId
  const res2 = await store.loginWithPIN('1111', 'staff-admin-01');
  assert.equal(res2.success, false, 'PIN targeting different staffId must fail');
  assert.equal(res2.error, 'Invalid PIN');

  // Attempt 3: Valid Admin PIN '1234' targeting Cashier staffId
  const res3 = await store.loginWithPIN('1234', 'staff-cashier-01');
  assert.equal(res3.success, false, 'Admin PIN cannot log into Cashier staffId');
  assert.equal(res3.error, 'Invalid PIN');

  // Attempt 4: Valid Admin PIN targeting Admin staffId
  const res4 = await store.loginWithPIN('1234', 'staff-admin-01');
  assert.equal(res4.success, true);
  assert.equal(store.currentStaff.role, ROLES.ADMIN);
});

suite.test('ADV-PIN-06: unlockScreen rejects invalid PINs and stays locked', async () => {
  resetStore();
  store.lockScreen();
  assert.equal(store.isLocked, true);

  // Attempt unlock with empty string
  const resEmpty = await store.unlockScreen('');
  assert.equal(resEmpty.success, false);
  assert.equal(store.isLocked, true, 'Terminal must remain locked on empty PIN');

  // Attempt unlock with wrong PIN
  const resWrong = await store.unlockScreen('0000');
  assert.equal(resWrong.success, false);
  assert.equal(store.isLocked, true, 'Terminal must remain locked on wrong PIN');

  // Attempt unlock with non-numeric string
  const resAlpha = await store.unlockScreen('abcd');
  assert.equal(resAlpha.success, false);
  assert.equal(store.isLocked, true, 'Terminal must remain locked on alphanumeric PIN');

  // Valid Manager PIN unlocks terminal
  const resUnlock = await store.unlockScreen('9999');
  assert.equal(resUnlock.success, true);
  assert.equal(store.isLocked, false, 'Terminal must unlock on valid Manager PIN');
});

suite.test('ADV-PIN-07: Numeric PIN inputs in verifyManagerOverride and unlockScreen are normalized without throwing', async () => {
  resetStore();

  // Numeric PIN passed to verifyManagerOverride is normalized and successfully authorizes
  const overrideRes = await store.verifyManagerOverride({
    pin: 9999,
    actionType: 'ORDER_VOID_ACTIVE'
  });
  assert.equal(overrideRes.success, true, 'Numeric manager PIN 9999 must successfully authorize override');
  assert.equal(overrideRes.authorizer.role, ROLES.MANAGER);

  // Numeric PIN passed to unlockScreen is normalized and successfully unlocks
  store.lockScreen();
  assert.equal(store.isLocked, true);
  const unlockRes = await store.unlockScreen(1111);
  assert.equal(unlockRes.success, true, 'Numeric cashier PIN 1111 must successfully unlock screen');
  assert.equal(store.isLocked, false);
});

// ============================================================================
// 3. RBAC SECURITY BOUNDARIES & ROLE ESCALATION (ADV-RBAC)
// ============================================================================

suite.test('ADV-RBAC-01: Exhaustive sensitive permissions strictly denied to Cashier, Server, Bartender', () => {
  const sensitiveOperations = [
    PERMISSIONS.ORDER_VOID_ACTIVE,
    PERMISSIONS.ITEM_DELETE_ACTIVE,
    PERMISSIONS.DISCOUNT_CUSTOM,
    PERMISSIONS.TABLE_FORCE_CLEAR,
    PERMISSIONS.PRICE_ALTER
  ];

  const nonManagerRoles = [ROLES.CASHIER, ROLES.SERVER, ROLES.BARTENDER];

  for (const role of nonManagerRoles) {
    for (const perm of sensitiveOperations) {
      assert.equal(
        hasPermission(role, perm),
        false,
        `Role "${role}" must be strictly denied sensitive permission "${perm}"`
      );
    }
  }
});

suite.test('ADV-RBAC-02: Administrative and hardware config permissions strictly denied to non-Admins', () => {
  const adminOnlyPermissions = [
    PERMISSIONS.TERMINAL_PAIR,
    PERMISSIONS.TERMINAL_CONFIG,
    'terminals:pair',
    'terminals:manage'
  ];

  const restrictedRoles = [ROLES.MANAGER, ROLES.CASHIER, ROLES.SERVER, ROLES.BARTENDER];

  for (const role of restrictedRoles) {
    for (const perm of adminOnlyPermissions) {
      assert.equal(
        hasPermission(role, perm),
        false,
        `Role "${role}" must NOT have admin permission "${perm}"`
      );
    }
  }

  // Admin must have all of them
  for (const perm of adminOnlyPermissions) {
    assert.equal(hasPermission(ROLES.ADMIN, perm), true);
  }
});

suite.test('ADV-RBAC-03: Inventory management & catalog price boundaries between Manager and Cashier/Server', () => {
  // Manager can alter price, batch ingest stock, adjust stock, manage staff
  assert.equal(hasPermission(ROLES.MANAGER, PERMISSIONS.PRICE_ALTER), true);
  assert.equal(hasPermission(ROLES.MANAGER, PERMISSIONS.STOCK_BATCH_INGEST), true);
  assert.equal(hasPermission(ROLES.MANAGER, PERMISSIONS.STOCK_ADJUST), true);
  assert.equal(hasPermission(ROLES.MANAGER, PERMISSIONS.STAFF_MANAGE), true);

  // Cashier cannot alter prices or batch ingest stock
  assert.equal(hasPermission(ROLES.CASHIER, PERMISSIONS.PRICE_ALTER), false);
  assert.equal(hasPermission(ROLES.CASHIER, PERMISSIONS.STOCK_BATCH_INGEST), false);
  assert.equal(hasPermission(ROLES.CASHIER, PERMISSIONS.STOCK_ADJUST), false);
  assert.equal(hasPermission(ROLES.CASHIER, PERMISSIONS.STAFF_MANAGE), false);

  // Server cannot alter prices, batch ingest, or toggle availability
  assert.equal(hasPermission(ROLES.SERVER, PERMISSIONS.PRICE_ALTER), false);
  assert.equal(hasPermission(ROLES.SERVER, PERMISSIONS.STOCK_BATCH_INGEST), false);
  assert.equal(hasPermission(ROLES.SERVER, PERMISSIONS.MENU_TOGGLE_AVAILABILITY), false);
});

suite.test('ADV-RBAC-04: Manager Override modal rejects all non-manager PINs (Privilege Escalation Prevention)', async () => {
  resetStore();
  await store.loginWithPIN('1111'); // Currently logged in as Cashier
  assert.equal(store.currentStaff.role, ROLES.CASHIER);

  // 1. Cashier attempts to authorize override with Cashier PIN
  const resCashier = await store.verifyManagerOverride({
    pin: '1111',
    actionType: 'ORDER_VOID_ACTIVE'
  });
  assert.equal(resCashier.success, false, 'Cashier PIN cannot authorize manager override');
  assert.ok(resCashier.error.includes('Insufficient Privileges'));

  // 2. Server attempts to authorize override with Server PIN
  const resServer = await store.verifyManagerOverride({
    pin: '2222',
    actionType: 'ORDER_VOID_ACTIVE'
  });
  assert.equal(resServer.success, false, 'Server PIN cannot authorize manager override');
  assert.ok(resServer.error.includes('Insufficient Privileges'));

  // 3. Bartender attempts to authorize override with Bartender PIN
  const resBar = await store.verifyManagerOverride({
    pin: '3333',
    actionType: 'ORDER_VOID_ACTIVE'
  });
  assert.equal(resBar.success, false, 'Bartender PIN cannot authorize manager override');
  assert.ok(resBar.error.includes('Insufficient Privileges'));

  // 4. Invalid PIN
  const resInvalid = await store.verifyManagerOverride({
    pin: '0000',
    actionType: 'ORDER_VOID_ACTIVE'
  });
  assert.equal(resInvalid.success, false);
  assert.equal(resInvalid.error, 'Invalid PIN');

  // 5. Empty / missing PIN
  const resEmpty = await store.verifyManagerOverride({
    pin: '',
    actionType: 'ORDER_VOID_ACTIVE'
  });
  assert.equal(resEmpty.success, false);
  assert.equal(resEmpty.error, 'Manager PIN is required');
});

suite.test('ADV-RBAC-05: Client-side role spoofing does not bypass Manager Override verification', async () => {
  resetStore();
  await store.loginWithPIN('1111'); // Cashier

  // Attacker tampers with client memory: changes currentStaff role to Admin
  store.currentStaff = { ...store.currentStaff, role: ROLES.ADMIN };
  assert.equal(store.currentStaff.role, ROLES.ADMIN);

  // Attacker enters Cashier PIN into override modal
  const overrideRes = await store.verifyManagerOverride({
    pin: '1111',
    actionType: 'ORDER_VOID_ACTIVE'
  });

  // Must still be rejected because authorizer is determined by the entered PIN, not client state
  assert.equal(overrideRes.success, false, 'Spoofed client role cannot authorize override with Cashier PIN');
  assert.ok(overrideRes.error.includes('Insufficient Privileges'));
});

suite.test('ADV-RBAC-06: Terminal pairing strictly requires Admin PIN when admin is present in roster', async () => {
  resetStore();
  await store.loginWithPIN('1111'); // Cashier active

  // 1. Attempt pairing with Cashier PIN
  const resCashier = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-02',
    adminPin: '1111'
  });
  assert.equal(resCashier.success, false, 'Cashier PIN must NOT pair terminal');
  assert.equal(resCashier.error, 'Unauthorized: Invalid Admin PIN');

  // 2. Attempt pairing with Manager PIN
  const resManager = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-02',
    adminPin: '9999'
  });
  assert.equal(resManager.success, false, 'Manager PIN must NOT pair terminal');
  assert.equal(resManager.error, 'Unauthorized: Invalid Admin PIN');

  // 3. Attempt pairing with no PIN
  const resNoPin = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-02'
  });
  assert.equal(resNoPin.success, false, 'Missing PIN must fail pairing');
  assert.equal(resNoPin.error, 'Admin PIN is required to authorize terminal pairing');

  // 4. Attempt pairing with valid Admin PIN
  const resAdmin = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-02',
    adminPin: '1234'
  });
  assert.equal(resAdmin.success, true, 'Admin PIN must authorize pairing');
  assert.equal(store.terminalPairing.sin, 'SIN-POS-02');
});

suite.test('ADV-RBAC-07: Terminal unpairing strictly requires Admin PIN', async () => {
  resetStore();
  await store.loginWithPIN('1111'); // Cashier active

  // 1. Cashier PIN attempt
  const resCashier = await store.unpairTerminal({ adminPin: '1111' });
  assert.equal(resCashier.success, false, 'Cashier PIN must NOT unpair terminal');
  assert.equal(resCashier.error, 'Unauthorized: Invalid Admin PIN');

  // 2. Manager PIN attempt
  const resManager = await store.unpairTerminal({ adminPin: '9999' });
  assert.equal(resManager.success, false, 'Manager PIN must NOT unpair terminal');
  assert.equal(resManager.error, 'Unauthorized: Invalid Admin PIN');

  // 3. Missing PIN attempt
  const resMissing = await store.unpairTerminal({});
  assert.equal(resMissing.success, false);
  assert.equal(resMissing.error, 'Admin PIN is required to unpair terminal');

  // 4. Admin PIN attempt
  const resAdmin = await store.unpairTerminal({ adminPin: '1234' });
  assert.equal(resAdmin.success, true);
  assert.equal(store.isTerminalPaired(), false);
});

suite.test('ADV-RBAC-08: Prototype pollution & Object prototype property collision in hasPermission', () => {
  // Normal invalid roles evaluate to false
  const safeInvalidRoles = [null, undefined, '', 'root', 'sudo', 'superuser', 'ADMIN', 'manager'];
  for (const role of safeInvalidRoles) {
    assert.equal(hasPermission(role, PERMISSIONS.POS_VIEW), false, `Role "${role}" must have no permissions`);
  }

  // Hardened assertion: prototype property roles safely return false without throwing TypeError
  assert.equal(
    hasPermission('constructor', 'POS_VIEW'),
    false,
    'Prototype property "constructor" as role must return false'
  );
  assert.equal(
    hasPermission('toString', 'POS_VIEW'),
    false,
    'Prototype property "toString" as role must return false'
  );
  assert.equal(
    hasPermission('valueOf', 'POS_VIEW'),
    false,
    'Prototype property "valueOf" as role must return false'
  );
  assert.equal(
    hasPermission('__proto__', 'POS_VIEW'),
    false,
    'Prototype property "__proto__" as role must return false'
  );
});

suite.test('ADV-RBAC-09: isSensitivePermission correctly identifies all high-risk POS operations', () => {
  assert.equal(isSensitivePermission(PERMISSIONS.ORDER_VOID_ACTIVE), true);
  assert.equal(isSensitivePermission(PERMISSIONS.ITEM_DELETE_ACTIVE), true);
  assert.equal(isSensitivePermission(PERMISSIONS.DISCOUNT_CUSTOM), true);
  assert.equal(isSensitivePermission(PERMISSIONS.TABLE_FORCE_CLEAR), true);
  assert.equal(isSensitivePermission(PERMISSIONS.PRICE_ALTER), true);
  
  // Aliases
  assert.equal(isSensitivePermission('orders:void'), true);
  assert.equal(isSensitivePermission('orders:discount'), true);
  assert.equal(isSensitivePermission('tables:force_clear'), true);

  // Non-sensitive
  assert.equal(isSensitivePermission(PERMISSIONS.POS_VIEW), false);
  assert.equal(isSensitivePermission(PERMISSIONS.ORDER_CREATE), false);
  assert.equal(isSensitivePermission(PERMISSIONS.BILL_SETTLE_STANDARD), false);
  assert.equal(isSensitivePermission(null), false);
  assert.equal(isSensitivePermission(undefined), false);
});

suite.test('ADV-RBAC-10: Manager Override creates tamper-evident audit record with authorizer role and initiator', async () => {
  resetStore();
  await store.loginWithPIN('1111'); // Logged in as Cashier Rohan Verma

  const initialLogCount = store.auditLogs.length;

  const overrideRes = await store.verifyManagerOverride({
    pin: '9999', // Manager Anand Kumar
    actionType: 'ORDER_VOID_ACTIVE',
    actionLabel: 'Void Order #104 (Damaged Prep)',
    targetItem: 'Order #104',
    initiator: store.currentStaff
  });

  assert.equal(overrideRes.success, true);
  assert.equal(store.auditLogs.length, initialLogCount + 1);

  const log = store.auditLogs[0];
  assert.equal(log.action, 'ORDER_VOID_ACTIVE');
  assert.equal(log.target_item, 'Order #104');
  assert.equal(log.initiator_staff_name, 'Rohan Verma');
  assert.equal(log.initiator_role, ROLES.CASHIER);
  assert.equal(log.authorizer_staff_name, 'Anand Kumar');
  assert.equal(log.authorizer_role, ROLES.MANAGER);
  assert.ok(log.timestamp);
});

suite.test('ADV-RBAC-11: Deactivated staff member (active: false) bypasses authentication and manager override', async () => {
  resetStore();

  const deactivatedManager = {
    id: 'staff-term-mgr-99',
    name: 'Terminated Manager Vikram',
    email: 'vikram.terminated@copperoak.com',
    role: ROLES.MANAGER,
    salt: 'salt-term-mgr',
    pin_hash: await hashPIN('8888', 'salt-term-mgr'),
    active: false
  };

  store.cachedStaff.push(deactivatedManager);

  // Hardened assertion: loginWithPIN rejects deactivated staff
  const loginRes = await store.loginWithPIN('8888');
  assert.equal(
    loginRes.success,
    false,
    'Deactivated staff member must be rejected during PIN login'
  );

  // Hardened assertion: Deactivated manager PIN rejected during manager override
  const overrideRes = await store.verifyManagerOverride({
    pin: '8888',
    actionType: 'ORDER_VOID_ACTIVE',
    actionLabel: 'Unauthorized Void by Terminated Manager'
  });
  assert.equal(
    overrideRes.success,
    false,
    'Deactivated manager PIN must NOT authorize sensitive manager override'
  );
});

import { pathToFileURL } from 'node:url';

if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || process.argv[1].includes('adversarial_m1_security'))) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
