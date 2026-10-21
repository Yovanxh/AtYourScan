# E2E Test Infra: Centralized Cloud POS Auth & Terminal Security Architecture

## Test Philosophy
- Opaque-box, requirement-driven. Derived from `ORIGINAL_REQUEST.md` and user-facing specifications.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Scenarios.
- Zero external dependencies: ESM-based Node.js test runner verifying store contracts, Web Crypto API hashing, offline storage state, and UI DOM contracts.

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| F1 | Cryptographic Engine & Cloud Schema | R1 | 5 | 5 | ✓ |
| F2 | Offline Staff Credential & Permission Caching | R5 | 5 | 5 | ✓ |
| F3 | SSO Session Token Generation & Multi-Outlet | R1 | 5 | 5 | ✓ |
| F4 | First-Run Onboarding Flow | R2 | 5 | 5 | ✓ |
| F5 | Hardware Terminal SIN Pairing & Persistence | R2 | 5 | 5 | ✓ |
| F6 | Interactive Numeric Keypad Component | R3 | 5 | 5 | ✓ |
| F7 | Header Role Badge & 1-Tap Screen Lock | R3 | 5 | 5 | ✓ |
| F8 | Fast Staff User Switching | R3 | 5 | 5 | ✓ |
| F9 | Sensitive Action Interception & RBAC Enforcement | R4 | 5 | 5 | ✓ |
| F10 | Manager Override Modal & Security Alerts | R4 | 5 | 5 | ✓ |
| F11 | Audit Trail Logging & Offline Sync | R4 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: `node tests/e2e_runner.mjs`
- **Pass/Fail Semantics**: All test suites must exit with code 0; assertions throw with detailed diff on mismatch.
- **Test Files**:
  - `tests/tier1_features.test.mjs` (Legacy baseline UI & routing, 100% passing)
  - `tests/tier2_boundaries.test.mjs` (Legacy boundary conditions)
  - `tests/tier3_combinations.test.mjs` (Legacy cross-feature combinations)
  - `tests/tier4_realworld.test.mjs` (Legacy real-world scenarios)
  - `tests/auth_terminal_security.test.mjs` (New comprehensive test suite covering R1-R5 across Tiers 1-4)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | First-Boot Setup to Paired Terminal Front Counter | F1, F4, F5 | High |
| 2 | Shift Change Handover Under Rush Hour | F6, F7, F8, F2 | Medium |
| 3 | Cashier Void Attempt with Supervisor PIN Override & Audit Logging | F7, F9, F10, F11 | High |
| 4 | Sudden Cloud Disconnect / Offline Bill Settlement & Local Staff Switch | F2, F8, F11 | High |
| 5 | De-authorization & Re-pairing with Malformed SIN Rejection | F5, F7, F10 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (where boundaries exist)
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic application scenarios
