/**
 * tests/fixtures/mockStaff.js
 * Test-only mock staff credentials fixture for automated test suites.
 * ISOLATED EXCLUSIVELY TO TESTS — NEVER REFERENCED OR BUNDLED INTO SRC/
 */

import { ROLES } from '../../src/auth.js';

export const MOCK_SEED_STAFF = Object.freeze([
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
]);

export const SEED_STAFF = MOCK_SEED_STAFF;
export default MOCK_SEED_STAFF;
