/**
 * AtYourScan Master E2E Test Suite Runner
 * Executes Tiers 1–4, aggregates statistics, outputs structured results, and ensures clean process termination.
 */

import { suite as tier1 } from './tier1_features.test.mjs';
import { suite as tier2 } from './tier2_boundaries.test.mjs';
import { suite as tier3 } from './tier3_cross_feature.test.mjs';
import { suite as tier4 } from './tier4_workloads.test.mjs';
import { suite as authSuite } from './auth_terminal_security.test.mjs';
import { suite as m2Suite } from './onboarding_terminal_pairing.test.mjs';
import { suite as m3Suite } from './staff_pin_keypad.test.mjs';
import { suite as m4Suite } from './manager_override_rbac.test.mjs';
import { suite as menuCatalogSuite } from './menu_catalog_bom.test.mjs';
import { suite as offerBannerSuite } from './offer_banner_customization.test.mjs';
import { suite as invoiceOcrSuite } from './invoice_ocr_real.test.mjs';
import { suite as masterMenuIngestionSuite } from './master_menu_ingestion.test.mjs';
import { suite as floorplanSyncSuite } from './floorplan_synchronization.test.mjs';
import { suite as superAdminSuite } from './super_admin_control_plane.test.mjs';
import { suite as qrPipelineSuite } from './qr_realtime_order_pipeline.test.mjs';
import { suite as multiRoleAuthSuite } from './multi_role_auth_gateway.test.mjs';
import { suite as forgotPasswordSuite } from './forgot_password_otp.test.mjs';

const suites = [
  authSuite, 
  m2Suite, 
  m3Suite, 
  m4Suite, 
  tier1, 
  tier2, 
  tier3, 
  tier4, 
  menuCatalogSuite, 
  offerBannerSuite, 
  invoiceOcrSuite, 
  masterMenuIngestionSuite, 
  floorplanSyncSuite, 
  superAdminSuite, 
  qrPipelineSuite,
  multiRoleAuthSuite,
  forgotPasswordSuite
];

async function runAllSuites() {
  const overallStart = Date.now();
  console.log('\n\x1b[1m\x1b[35m============================================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m       AtYourScan Automated E2E Test Suite (Tiers 1–4)      \x1b[0m');
  console.log('\x1b[1m\x1b[35m============================================================\x1b[0m');

  const summary = [];
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const s of suites) {
    const res = await s.run();
    summary.push(res);
    totalTests += res.total;
    totalPassed += res.passed;
    totalFailed += res.failed;
  }

  const overallDuration = Date.now() - overallStart;

  // --- STRUCTURED SUMMARY REPORT ---
  console.log('\n\x1b[1m\x1b[37m======================= TEST SUMMARY =======================\x1b[0m');
  console.log('Tier / Suite                               Total  Pass  Fail  Time');
  console.log('------------------------------------------------------------');

  for (const s of summary) {
    const namePadded = s.name.padEnd(42, ' ');
    const totalPadded = String(s.total).padStart(5, ' ');
    const passPadded = String(s.passed).padStart(5, ' ');
    const failPadded = String(s.failed).padStart(5, ' ');
    const timePadded = `${s.durationMs}ms`.padStart(7, ' ');

    const color = s.failed > 0 ? '\x1b[31m' : '\x1b[32m';
    console.log(`${color}${namePadded}${totalPadded}${passPadded}${failPadded}${timePadded}\x1b[0m`);
  }

  console.log('------------------------------------------------------------');
  const totalsLine = `TOTAL`.padEnd(42, ' ') +
    String(totalTests).padStart(5, ' ') +
    String(totalPassed).padStart(5, ' ') +
    String(totalFailed).padStart(5, ' ') +
    `${overallDuration}ms`.padStart(7, ' ');
  
  if (totalFailed > 0) {
    console.log(`\x1b[1m\x1b[31m${totalsLine}\x1b[0m`);
    console.log(`\n\x1b[1m\x1b[31m❌ E2E TEST RUN COMPLETED WITH ${totalFailed} FAILURES\x1b[0m\n`);
  } else {
    console.log(`\x1b[1m\x1b[32m${totalsLine}\x1b[0m`);
    console.log(`\n\x1b[1m\x1b[32m✔ ALL ${totalPassed} E2E TESTS PASSED SUCCESSFULLY! (100%)\x1b[0m\n`);
  }

  // Explicitly exit process to clean up any background websocket/timer handles
  process.exit(totalFailed > 0 ? 1 : 0);
}

runAllSuites().catch(err => {
  console.error('\nFatal error running test suite:', err);
  process.exit(1);
});

