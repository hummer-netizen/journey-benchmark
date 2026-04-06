import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { AUTH_APP_URL } from './config.js';

const MAILPIT_API = process.env['MAILPIT_API'] ?? 'http://localhost:8025';

interface AuthAppConfig {
  baseUrl: string;
}

export class J08AccountRegistration extends BaseJourney {
  readonly id = 'J08';
  readonly name = 'Account Registration + Email Verify';
  readonly steps: JourneyStep[];

  private testEmail: string = '';
  private verifyUrl: string = '';

  constructor(config: AuthAppConfig) {
    super(config as unknown as SiteConfig);
    this.testEmail = `test_${Date.now()}@example.com`;
    this.steps = this.buildSteps();
  }

  private async fetchVerificationEmail(email: string, retries = 10): Promise<string> {
    for (let i = 0; i < retries; i++) {
      const resp = await fetch(`${MAILPIT_API}/api/v1/messages`);
      if (!resp.ok) throw new Error(`MailPit API error: ${resp.status}`);
      const data = await resp.json() as { messages?: Array<{ ID: string; To: Array<{ Address: string }>; Subject: string }> };
      const messages = data.messages ?? [];
      const msg = messages.find((m) =>
        m.To.some((t) => t.Address === email) && m.Subject.includes('Verify')
      );
      if (msg) {
        const msgResp = await fetch(`${MAILPIT_API}/api/v1/message/${msg.ID}`);
        const msgData = await msgResp.json() as { Text?: string; HTML?: string };
        const body = msgData.Text ?? msgData.HTML ?? '';
        const match = body.match(/https?:\/\/[^\s<"]+\/verify-email\?token=[a-f0-9]+/);
        if (match) return match[0];
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Verification email for ${email} not found in MailPit after ${retries} attempts`);
  }

  private buildSteps(): JourneyStep[] {
    return [
      {
        name: 'Navigate to registration page',
        goal: 'Navigate to the /register page and wait for the registration form to load.',
        execute: async (page: Page) => {
          // Generate a fresh email for each run to avoid "already registered" collisions
          this.testEmail = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
          // Navigate directly to /register (avoids same-origin proxy navigation issues in Surfly)
          await page.goto(`${AUTH_APP_URL}/register`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('#register-btn', { timeout: 10000 });
        },
      },
      {
        name: 'Fill registration form',
        goal: "Fill in the registration form with: name='Test User', email=test_<timestamp>@example.com, password='TestPass123!'.",
        execute: async (page: Page) => {
          await page.fill('input[name="name"]', 'Test User');
          await page.fill('input[name="email"]', this.testEmail);
          await page.fill('input[name="password"]', 'TestPass123!');
        },
      },
      {
        name: 'Submit registration',
        goal: "Click the Register button and verify the registration was successful (no error message shown).",
        execute: async (page: Page) => {
          await page.click('#register-btn');
          await page.waitForSelector('.success, .error', { timeout: 15000 });
          const error = await page.$('.error');
          if (error) {
            const msg = await error.textContent();
            throw new Error(`Registration failed: ${msg}`);
          }
        },
      },
      {
        name: 'Retrieve verification email from MailPit',
        goal: 'Wait for the email verification link to be available via MailPit API. No browser interaction needed for this step.',
        execute: async (_page: Page) => {
          this.verifyUrl = await this.fetchVerificationEmail(this.testEmail);
        },
      },
      {
        name: 'Visit email verification link',
        goal: 'Navigate to the email verification link to activate the account and verify no error is shown.',
        execute: async (page: Page) => {
          // Replace app URL if it differs (e.g. internal vs external)
          const adjustedUrl = this.verifyUrl.replace(/^https?:\/\/[^/]+/, AUTH_APP_URL);
          await page.goto(adjustedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector('.success, .error', { timeout: 10000 });
          const error = await page.$('.error');
          if (error) {
            const msg = await error.textContent();
            throw new Error(`Email verification failed: ${msg}`);
          }
        },
      },
      {
        name: 'Verify account is active (login)',
        goal: "Navigate to /login, fill in the test email and password 'TestPass123!', click Login, and verify login succeeds.",
        execute: async (page: Page) => {
          await page.goto(`${AUTH_APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.fill('input[name="email"]', this.testEmail);
          await page.fill('input[name="password"]', 'TestPass123!');
          await page.click('#login-btn');
          await page.waitForSelector('#login-success, .error', { timeout: 10000 });
          const error = await page.$('.error');
          if (error) {
            const msg = await error.textContent();
            throw new Error(`Login after verification failed: ${msg}`);
          }
        },
      },
    ];
  }
}
