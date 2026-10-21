# Project: AtYourScan Cloud POS Auth & Terminal Security Architecture

## Architecture
AtYourScan is a modern ES Module Vanilla JavaScript Single Page Hospitality OS bundled with Vite 5.4.
- **Root Shell**: `index.html` hosts `#top-navigation-rail`, `#app-view-container`, and `#app-modal-layer`.
- **Router & View Switcher**: `src/main.js` manages navigation across canonical views, active staff capsule header display, 1-tap screen lock overlay, and auxiliary modal routing.
- **Security & Authentication Subsystem**: `src/auth.js` provides centralized RBAC matrices, Web Crypto PBKDF2 / SHA-256 password & PIN hashing, SSO session tokens, and local offline credential caching.
- **Reactive Central Store**: `src/store.js` manages state, LocalStorage persistence, Supabase Realtime synchronization, terminal pairing state, active staff sessions, manager override audit logs, and audio feedback.
- **Components**:
  - `src/components/OnboardingModal.js`: First-run setup wizard for merchant registration, admin credentials, staff roster, and terminal hardware registration.
  - `src/components/TerminalPairingModal.js`: Hardware pairing interface accepting Restaurant ID and Terminal SIN code (`SIN-POS-01`) with Admin PIN verification and auto-recognition.
  - `src/components/PINKeypad.js`: 3x4 touch-friendly numeric keypad for 4-to-6 digit PIN entry, masked dots, staff switching, and full-screen lock.
  - `src/components/ManagerOverrideModal.js`: Automated security challenge modal triggered on sensitive operations (voids, item deletes, discounts, table force-clears) requiring Manager/Admin PIN.
  - `src/components/CustomerView.js`, `SalesAnalyticsView.js`, `FloorplanView.js`, `StockIngestionView.js`, `KDSView.js`, `QRStudioView.js`: Canonical hospitality views.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Cryptographic Engine & Cloud Schema | PBKDF2/SHA-256 via Web Crypto API, schema.sql tables for merchants, users, terminals, sso_sessions, audit_logs | M1 | R1, Survey 1 |
| F2 | Offline Staff Credential & Permission Caching | Salted hashed PINs stored in localStorage (`ays_cached_staff`), offline permission validation with zero network calls | M1 | R5, Survey 1, Survey 3 |
| F3 | SSO Session Token Generation & Multi-Outlet | Cryptographic session tokens carrying user id, merchant id, outlet scopes, role, permissions, cross-tab sync | M1 | R1, Survey 1 |
| F4 | First-Run Onboarding Flow | Uninitialized state detection, 4-step wizard to register merchant outlet, master admin credentials, and initial terminal | M2 | R2, Survey 2 |
| F5 | Hardware Terminal SIN Pairing & Persistence | Restaurant ID + Terminal SIN (`SIN-POS-01`) pairing, hardware fingerprint, persistent boot auto-recognition | M2 | R2, Survey 2 |
| F6 | Interactive Numeric Keypad Component | 3x4 touch-friendly keypad, 4-to-6 digit PIN slots, masked bullets, auditory feedback, lock overlay mode | M3 | R3, Survey 3 |
| F7 | Header Role Badge & 1-Tap Screen Lock | Top nav capsule with staff name, color-coded role badge (Admin, Manager, Cashier, Server, Bartender), 1-tap lock button | M3 | R3, Survey 3 |
| F8 | Fast Staff User Switching | Instant (<5ms) session switching via numeric PIN or quick staff roster buttons without page reload | M3 | R3, Survey 3 |
| F9 | Sensitive Action Interception & RBAC Enforcement | Intercepting order voids, item deletions, custom discounts, table force-clears, menu price changes | M4 | R4, Survey 3 |
| F10 | Manager Override Modal & Security Alerts | Supervisor PIN challenge, invalid PIN rejection alerts with shake animation, manager approval dispatch | M4 | R4, Survey 3 |
| F11 | Audit Trail Logging & Offline Sync | Immutable audit logging (timestamp, action, target item, authorizer, initiator, terminal SIN) with local buffer & Supabase sync | M4 | R4, Survey 1, Survey 3 |
| F12 | Dual-Track E2E Test Suite (Tiers 1-4) | Comprehensive opaque-box and integration automated test suite covering all R1-R5 acceptance criteria & offline resilience | M5 | AC, Survey 1, 2, 3 |
| F13 | Production Build, Hardening & Forensic Audit | Zero build errors in `npm run build`, 100% test pass rate, adversarial edge-case stress testing, and forensic integrity audit | M6 | AC |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Auth Engine, RBAC & Offline Caching | `src/auth.js`, Web Crypto PBKDF2/SHA-256, seed staff credentials, `src/store.js` auth extensions, `schema.sql` | none | DONE |
| M2 | First-Run Onboarding & Terminal SIN Pairing | `src/components/OnboardingModal.js`, `src/components/TerminalPairingModal.js`, uninitialized detection, persistent pairing | M1 | DONE |
| M3 | Quick Staff PIN Keypad & Fast User Switching | `src/components/PINKeypad.js`, `src/main.js` header staff pill, role badges, 1-tap lock screen overlay | M1 | DONE |
| M4 | RBAC Action Interception & Manager Override | `src/components/ManagerOverrideModal.js`, interceptors in POS & Floorplan, audit trail logging in store & cloud | M1, M3 | DONE |
| M5 | Dual-Track E2E Test Suite (Tiers 1-4) | Automated test suite in `tests/` covering R1-R5, offline resilience tests, test runner integration (191/191 tests passed) | M1, M2, M3, M4 | DONE |
| M6 | Final Verification, Hardening & Forensic Audit | Production build verification, 100% E2E test pass, adversarial test hardening, forensic integrity audit verification | M1, M2, M3, M4, M5 | DONE |

---

## Interface Contracts

### `src/auth.js` Interface
```javascript
export const ROLES = { ADMIN: 'Admin', MANAGER: 'Manager', CASHIER: 'Cashier', SERVER: 'Server', BARTENDER: 'Bartender' };
export const PERMISSIONS = { ... };
export const ROLE_PERMISSIONS = { ... };
export const SEED_STAFF = [ ... ];
export async function hashPassword(password, salt): Promise<{ hash: string, salt: string }>;
export async function hashPIN(pin, salt): Promise<string>;
export function verifyPINSync(pin, salt, expectedHash): Promise<boolean>;
export function hasPermission(role, permission): boolean;
export function createSSOToken(user, outletId, terminalSin): string;
export function verifySSOToken(token): { valid: boolean, payload: object | null };
```

### `src/store.js` Auth & Security Extensions
```javascript
// State properties:
store.currentStaff: StaffMember;
store.isLocked: boolean;
store.terminalPairing: TerminalPairing | null;
store.auditLogs: AuditLogEntry[];
store.cachedStaff: StaffMember[];

// Auth Methods:
store.isUninitialized(): boolean;
store.completeOnboarding(onboardingData): Promise<boolean>;
store.isTerminalPaired(): boolean;
store.getPairedTerminal(): TerminalPairing | null;
store.pairTerminal({ restaurantId, sin, terminalName, terminalType, adminPin }): Promise<{ success: boolean, error?: string }>;
store.unpairTerminal({ adminPin }): Promise<{ success: boolean, error?: string }>;
store.loginWithPIN(pin, staffId?): Promise<{ success: boolean, staff?: object, error?: string }>;
store.switchStaff(pin, staffId?): Promise<{ success: boolean, staff?: object, error?: string }>;
store.lockScreen(): void;
store.unlockScreen(pin): Promise<{ success: boolean, error?: string }>;
store.hasPermission(permission): boolean;
store.verifyManagerOverride({ pin, actionType, actionLabel, targetItem, initiator }): Promise<{ success: boolean, authorizer?: object, error?: string }>;
store.recordAuditLog(entry): AuditLogEntry;
store.resetToUninitialized(): void;
```

### View & Component Contracts
- Every modal module (`OnboardingModal.js`, `TerminalPairingModal.js`, `ManagerOverrideModal.js`, `PINKeypad.js`) renders into DOM container or `#app-modal-layer`, handles events, provides clean dismissal callback.
- Top rail in `src/main.js` maintains the 6 canonical views (`customer`, `analytics`, `floorplan`, `stock`, `kds`, `qr`) and mounts `#header-staff-container` with active role badge and 1-tap lock button.

---

## Code Layout
- `index.html`: Shell, Tailwind theme configuration, modal layer mount `<div id="app-modal-layer"></div>`.
- `schema.sql`: Database schema with `merchants`, `venues`, `users`, `terminals`, `sso_sessions`, `audit_logs`.
- `src/auth.js`: Core RBAC rules, Web Crypto PBKDF2/SHA-256 hashing, SSO tokens, offline credential cache.
- `src/store.js`: Central state, LocalStorage persistence, Supabase client sync, auth/session state, audit logs.
- `src/main.js`: Root router, 6 canonical views, top rail with staff session pill and 1-tap screen lock.
- `src/components/OnboardingModal.js`: First-run setup modal wizard.
- `src/components/TerminalPairingModal.js`: Hardware pairing modal.
- `src/components/PINKeypad.js`: Numeric touch keypad & lock screen overlay.
- `src/components/ManagerOverrideModal.js`: Security challenge modal for sensitive POS operations.
- `src/components/POSView.js`: Front counter POS with protected sensitive actions.
- `src/components/FloorplanView.js`: Table floorplan with protected force-clears and voids.
- `tests/`: Automated test suite (test runner, unit & integration tests across Tiers 1-4).
