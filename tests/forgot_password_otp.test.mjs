/**
 * tests/forgot_password_otp.test.mjs
 * Test Suite: Email OTP Password Recovery & Verification Subsystem
 */

import assert from 'node:assert/strict';
import { createTestSuite, setupTestEnvironment } from './helpers.mjs';

import { store } from '../src/store.js';
import { renderLoginView } from '../src/views/loginView.js';

setupTestEnvironment();
export const suite = createTestSuite('Forgot Password & Email OTP Recovery Suite');

function reset() {
  store.logoutUser();
  store.users = [
    {
      id: 'user-cafe-test-01',
      name: 'Simulated Owner',
      email: 'owner@firstway.com',
      role: 'cafe_admin',
      system_role: 'cafe_admin',
      password: 'OldPassword2026!',
      active: true
    }
  ];
  store.superAdminAccounts = [
    {
      id: 'master-test-01',
      name: 'Super Admin',
      email: 'master@atyourscan.com',
      role: 'Super Admin',
      system_role: 'master_admin',
      is_super_admin: true,
      pin: '7788',
      active: true
    }
  ];
  store.cachedStaff = [
    {
      id: 'staff-test-01',
      name: 'Rohan Verma',
      email: 'rohan@firstway.com',
      role: 'Cashier',
      pin: '1111',
      active: true
    }
  ];
  try {
    localStorage.removeItem('ays_reset_otps');
  } catch {}
  delete store.passwordResetOTPs;
}

suite.test('FPO-01: Rejects invalid or unregistered email address', async () => {
  reset();
  const invalidEmailRes = await store.requestPasswordResetOTP({ email: 'notanemail' });
  assert.strictEqual(invalidEmailRes.success, false);
  assert.ok(invalidEmailRes.error.includes('valid registered email'));

  const unregisteredRes = await store.requestPasswordResetOTP({ email: 'unknown@stranger.com' });
  assert.strictEqual(unregisteredRes.success, false);
  assert.ok(unregisteredRes.error.includes('No registered account found'));
});

suite.test('FPO-02: Generates and dispatches 6-digit OTP code to registered email', async () => {
  reset();
  const res = await store.requestPasswordResetOTP({ email: 'owner@firstway.com' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.email, 'owner@firstway.com');
  assert.ok(res.otp);
  assert.strictEqual(res.otp.length, 6);
  assert.ok(/^\d{6}$/.test(res.otp));
  assert.ok(res.message.includes('dispatched to owner@firstway.com'));
});

suite.test('FPO-03: Rejects invalid OTP code during verification', async () => {
  reset();
  await store.requestPasswordResetOTP({ email: 'owner@firstway.com' });

  const failRes = await store.verifyAndResetPasswordWithOTP({
    email: 'owner@firstway.com',
    otp: '000000',
    newPassword: 'BrandNewPassword2026!',
    confirmPassword: 'BrandNewPassword2026!'
  });

  assert.strictEqual(failRes.success, false);
  assert.ok(failRes.error.includes('Invalid OTP code'));
});

suite.test('FPO-04: Rejects mismatched or too-short confirmation password', async () => {
  reset();
  const otpRes = await store.requestPasswordResetOTP({ email: 'owner@firstway.com' });

  const mismatchRes = await store.verifyAndResetPasswordWithOTP({
    email: 'owner@firstway.com',
    otp: otpRes.otp,
    newPassword: 'Password1!',
    confirmPassword: 'Password2!'
  });
  assert.strictEqual(mismatchRes.success, false);
  assert.ok(mismatchRes.error.includes('do not match'));

  const shortRes = await store.verifyAndResetPasswordWithOTP({
    email: 'owner@firstway.com',
    otp: otpRes.otp,
    newPassword: '12',
    confirmPassword: '12'
  });
  assert.strictEqual(shortRes.success, false);
  assert.ok(shortRes.error.includes('at least 4 characters'));
});

suite.test('FPO-05: Successfully updates password across store registries upon valid OTP verification', async () => {
  reset();
  const otpRes = await store.requestPasswordResetOTP({ email: 'owner@firstway.com' });

  const resetRes = await store.verifyAndResetPasswordWithOTP({
    email: 'owner@firstway.com',
    otp: otpRes.otp,
    newPassword: 'UpdatedSecurePass2026!',
    confirmPassword: 'UpdatedSecurePass2026!'
  });

  assert.strictEqual(resetRes.success, true);
  assert.ok(resetRes.message.includes('Password updated successfully'));

  // Verify updated in users registry
  const updatedUser = store.users.find(u => u.email === 'owner@firstway.com');
  assert.ok(updatedUser);
  assert.strictEqual(updatedUser.password, 'UpdatedSecurePass2026!');
  assert.ok(updatedUser.password_hash);
  assert.ok(updatedUser.salt);
});

suite.test('FPO-06: Authenticates user with new password immediately after reset', async () => {
  reset();
  const otpRes = await store.requestPasswordResetOTP({ email: 'owner@firstway.com' });
  await store.verifyAndResetPasswordWithOTP({
    email: 'owner@firstway.com',
    otp: otpRes.otp,
    newPassword: 'NewLoginPass2026!',
    confirmPassword: 'NewLoginPass2026!'
  });

  // Old password should fail
  const oldLogin = await store.loginUser({
    type: 'cafe_admin',
    email: 'owner@firstway.com',
    password: 'OldPassword2026!'
  });
  assert.strictEqual(oldLogin.success, false);

  // New password logs in successfully
  const newLogin = await store.loginUser({
    type: 'cafe_admin',
    email: 'owner@firstway.com',
    password: 'NewLoginPass2026!'
  });
  assert.strictEqual(newLogin.success, true);
  assert.strictEqual(store.currentUser.email, 'owner@firstway.com');
});

suite.test('FPO-07: One-time use: invalidates OTP after successful reset to prevent replay attacks', async () => {
  reset();
  const otpRes = await store.requestPasswordResetOTP({ email: 'owner@firstway.com' });
  await store.verifyAndResetPasswordWithOTP({
    email: 'owner@firstway.com',
    otp: otpRes.otp,
    newPassword: 'FirstUpdatePass2026!',
    confirmPassword: 'FirstUpdatePass2026!'
  });

  // Replay attempt with same OTP must fail
  const replayRes = await store.verifyAndResetPasswordWithOTP({
    email: 'owner@firstway.com',
    otp: otpRes.otp,
    newPassword: 'MaliciousReplayPass!',
    confirmPassword: 'MaliciousReplayPass!'
  });
  assert.strictEqual(replayRes.success, false);
  assert.ok(replayRes.error.includes('No OTP request found'));
});

suite.test('FPO-08: Renders "Forgot Password?" buttons in renderLoginView and mounts OTP form', () => {
  reset();
  const container = document.createElement('div');
  renderLoginView(container, store);

  const btnForgotCafe = container.querySelector('#btn-forgot-password-cafe');
  assert.ok(btnForgotCafe, 'Must render #btn-forgot-password-cafe in Cafe Admin login form');

  // Trigger Forgot Password view
  btnForgotCafe.click();

  const formRequest = container.querySelector('#form-request-otp');
  assert.ok(formRequest, 'Must mount #form-request-otp when Forgot Password is clicked');
  const inputEmail = container.querySelector('#input-forgot-email');
  assert.ok(inputEmail, 'Must render #input-forgot-email in recovery view');
  const btnSend = container.querySelector('#btn-send-otp-submit');
  assert.ok(btnSend, 'Must render #btn-send-otp-submit');
});
