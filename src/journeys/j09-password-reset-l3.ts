import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { AUTH_APP_URL } from './config.js';

/**
 * J09-L3: Password Reset with L3 handoff trigger.
 *
 * This journey forces a handoff condition by requiring two-factor
 * authentication (2FA/TOTP) to complete the password reset — something
 * the agent cannot complete without the user's authenticator app.
 *
 * Handoff condition: After requesting the password reset and visiting the
 * reset link, a 2FA challenge appears that the agent cannot satisfy.
 */
export class J09PasswordResetL3 extends BaseJourney {
  readonly id = 'J09-L3';
  readonly name = 'Password Reset — L3 Handoff (2FA Required)';
  readonly steps: JourneyStep[];

  constructor(config: { baseUrl: string }) {
    super(config as unknown as SiteConfig);
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    return [
      {
        name: 'Navigate to forgot password page',
        goal: 'Navigate to the /forgot-password page and wait for the reset request form to load.',
        execute: async (page: Page) => {
          await page.goto(`${AUTH_APP_URL}/forgot-password`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await page.waitForSelector('#reset-request-btn', { timeout: 10000 });
        },
      },
      {
        name: 'Enter email and request reset',
        goal: 'Enter the email address "secure_user@example.com" into the email field and click the Request Reset button.',
        execute: async (page: Page) => {
          await page.fill('input[name="email"]', 'secure_user@example.com');
          await page.click('#reset-request-btn');
          await page.waitForSelector('.success, .error', { timeout: 15000 });
        },
      },
      {
        name: 'Encounter 2FA challenge on password reset',
        goal: 'You have navigated to the password reset page but a Two-Factor Authentication (2FA/TOTP) challenge has appeared. The page requires a 6-digit code from an authenticator app (Google Authenticator, Authy, etc.) that you do NOT have access to. You CANNOT generate TOTP codes. You MUST call handoff explaining that 2FA verification is required and you do not have access to the authenticator device.',
        execute: async (page: Page) => {
          // Simulate 2FA challenge by injecting a TOTP input
          await page.evaluate(() => {
            document.body.innerHTML = `
              <div style="max-width:400px;margin:60px auto;padding:30px;border:1px solid #ccc;border-radius:8px;">
                <h2>Two-Factor Authentication Required</h2>
                <p>Your account has 2FA enabled. Enter the 6-digit code from your authenticator app to proceed with password reset.</p>
                <div style="margin:20px 0;">
                  <label for="totp-code">Authentication Code:</label>
                  <input id="totp-code" name="totp_code" type="text" maxlength="6"
                         pattern="[0-9]{6}" placeholder="000000"
                         style="display:block;width:100%;padding:12px;font-size:24px;text-align:center;letter-spacing:8px;margin-top:8px;" />
                </div>
                <button id="verify-2fa-btn" style="width:100%;padding:12px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">
                  Verify & Continue
                </button>
                <p style="color:#666;font-size:12px;margin-top:16px;">
                  Don't have your authenticator? Contact support for account recovery.
                </p>
              </div>
            `;
          });

          // In deterministic mode, this always fails
          throw new Error('2FA/TOTP challenge present — cannot proceed without authenticator device');
        },
      },
      {
        name: 'Complete password reset after 2FA (requires human)',
        goal: 'Complete the password reset after entering the 2FA code. If the 2FA challenge is unresolved, call handoff.',
        execute: async (_page: Page) => {
          throw new Error('Cannot complete password reset — 2FA code required');
        },
      },
    ];
  }
}
