import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { AUTH_APP_URL } from './config.js';

const MAILPIT_API = process.env['MAILPIT_API'] ?? 'http://localhost:8025';

interface AuthAppConfig {
  baseUrl: string;
}

export class J09PasswordReset extends BaseJourney {
  readonly id = 'J09';
  readonly name = 'Password Reset';
  readonly steps: JourneyStep[];

  private testEmail: string = '';
  private resetUrl: string = '';
  private newPassword: string = 'NewPass456!';

  constructor(config: AuthAppConfig) {
    super(config as unknown as SiteConfig);
    this.testEmail = `reset_${Date.now()}@example.com`;
    this.steps = this.buildSteps();
  }

  private async fetchResetEmail(email: string, retries = 10): Promise<string> {
    for (let i = 0; i < retries; i++) {
      const resp = await fetch(`${MAILPIT_API}/api/v1/messages`);
      if (!resp.ok) throw new Error(`MailPit API error: ${resp.status}`);
      const data = await resp.json() as { messages?: Array<{ ID: string; To: Array<{ Address: string }>; Subject: string }> };
      const messages = data.messages ?? [];
      const msg = messages.find((m) =>
        m.To.some((t) => t.Address === email) && m.Subject.includes('Reset')
      );
      if (msg) {
        const msgResp = await fetch(`${MAILPIT_API}/api/v1/message/${msg.ID}`);
        const msgData = await msgResp.json() as { Text?: string; HTML?: string };
        const body = msgData.Text ?? msgData.HTML ?? '';
        const match = body.match(/https?:\/\/[^\s<"]+\/reset-password\?token=[a-f0-9]+/);
        if (match) return match[0];
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Reset email for ${email} not found in MailPit after ${retries} attempts`);
  }

  private async setupTestAccount(): Promise<void> {
    // Create a pre-verified account directly via the auth app API
    await fetch(`${AUTH_APP_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `name=Reset+Test+User&email=${encodeURIComponent(this.testEmail)}&password=OldPass123!`,
      redirect: 'manual',
    });
    // Get the verify token from MailPit and activate the account
    const verifyUrl = await this.fetchVerificationEmail(this.testEmail);
    const adjustedUrl = verifyUrl.replace(/^https?:\/\/[^/]+/, AUTH_APP_URL);
    await fetch(adjustedUrl);
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
    throw new Error(`Verification email for ${email} not found`);
  }

  private buildSteps(): JourneyStep[] {
    return [
      {
        name: 'Setup test account (register + verify)',
        execute: async (_page: Page) => {
          await this.setupTestAccount();
        },
      },
      {
        name: 'Navigate to forgot password page',
        execute: async (page: Page) => {
          await page.goto(`${AUTH_APP_URL}/forgot-password`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('#reset-request-btn', { timeout: 10000 });
        },
      },
      {
        name: 'Enter email and request reset',
        execute: async (page: Page) => {
          await page.fill('input[name="email"]', this.testEmail);
          await page.click('#reset-request-btn');
          await page.waitForSelector('.success', { timeout: 15000 });
        },
      },
      {
        name: 'Retrieve reset email from MailPit',
        execute: async (_page: Page) => {
          this.resetUrl = await this.fetchResetEmail(this.testEmail);
        },
      },
      {
        name: 'Visit password reset link',
        execute: async (page: Page) => {
          const adjustedUrl = this.resetUrl.replace(/^https?:\/\/[^/]+/, AUTH_APP_URL);
          await page.goto(adjustedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector('#reset-password-btn', { timeout: 10000 });
        },
      },
      {
        name: 'Set new password',
        execute: async (page: Page) => {
          await page.fill('input[name="password"]', this.newPassword);
          await page.fill('input[name="confirm_password"]', this.newPassword);
          await page.click('#reset-password-btn');
          await page.waitForURL(/\/login/, { timeout: 15000 });
        },
      },
      {
        name: 'Verify login with new password',
        execute: async (page: Page) => {
          await page.fill('input[name="email"]', this.testEmail);
          await page.fill('input[name="password"]', this.newPassword);
          await page.click('#login-btn');
          await page.waitForSelector('#login-success, .error', { timeout: 10000 });
          const error = await page.$('.error');
          if (error) {
            const msg = await error.textContent();
            throw new Error(`Login with new password failed: ${msg}`);
          }
        },
      },
    ];
  }
}
