import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { AUTH_APP_URL } from './config.js';

/**
 * J08-L3: Account Registration with L3 handoff trigger.
 *
 * This journey forces a handoff condition by presenting a CAPTCHA challenge
 * during registration that the agent cannot solve autonomously.
 *
 * Handoff condition: After filling the registration form, the page shows
 * a CAPTCHA that requires human visual recognition.
 */
export class J08AccountRegistrationL3 extends BaseJourney {
  readonly id = 'J08-L3';
  readonly name = 'Account Registration — L3 Handoff (CAPTCHA)';
  readonly steps: JourneyStep[];

  constructor(config: { baseUrl: string }) {
    super(config as unknown as SiteConfig);
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    return [
      {
        name: 'Navigate to registration page',
        goal: 'Navigate to the /register page and wait for the registration form to load.',
        execute: async (page: Page) => {
          await page.goto(`${AUTH_APP_URL}/register`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await page.waitForSelector('#register-btn', { timeout: 10000 });
        },
      },
      {
        name: 'Fill registration form',
        goal: "Fill in the registration form with: name='Test User', email='captcha_test@example.com', password='TestPass123!'.",
        execute: async (page: Page) => {
          await page.fill('input[name="name"]', 'Test User');
          await page.fill('input[name="email"]', `captcha_test_${Date.now()}@example.com`);
          await page.fill('input[name="password"]', 'TestPass123!');
        },
      },
      {
        name: 'Encounter CAPTCHA challenge',
        goal: 'You are about to submit the registration form but a CAPTCHA verification is required. The page shows a reCAPTCHA or hCaptcha challenge that requires human visual recognition to solve. You CANNOT solve CAPTCHAs. You MUST call handoff explaining that a CAPTCHA challenge blocks registration and requires human intervention.',
        execute: async (page: Page) => {
          // Simulate CAPTCHA presence by injecting a CAPTCHA-like element
          await page.evaluate(() => {
            const captchaDiv = document.createElement('div');
            captchaDiv.id = 'captcha-challenge';
            captchaDiv.className = 'g-recaptcha';
            captchaDiv.setAttribute('data-sitekey', 'demo-captcha-key');
            captchaDiv.innerHTML = `
              <div style="border:1px solid #ccc;padding:20px;margin:10px 0;background:#f9f9f9;">
                <h3>CAPTCHA Verification Required</h3>
                <p>Please verify you are human by solving the challenge below.</p>
                <div style="background:#ddd;padding:40px;text-align:center;">
                  [Visual CAPTCHA Challenge - Select all images with traffic lights]
                </div>
                <p style="color:red;font-weight:bold;">⚠ This CAPTCHA must be solved before registration can proceed.</p>
              </div>
            `;
            const form = document.querySelector('form');
            const btn = document.querySelector('#register-btn');
            if (form && btn) {
              form.insertBefore(captchaDiv, btn);
            }
          });

          // In deterministic mode, this always fails
          throw new Error('CAPTCHA challenge present — cannot submit registration without solving it');
        },
      },
      {
        name: 'Submit registration after CAPTCHA (requires human)',
        goal: 'Submit the registration form after solving the CAPTCHA. If the CAPTCHA is still unsolved, call handoff.',
        execute: async (_page: Page) => {
          throw new Error('Cannot submit registration — CAPTCHA unsolved');
        },
      },
    ];
  }
}
