import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { RETURN_PORTAL_URL } from './config.js';

interface ReturnPortalConfig {
  baseUrl: string;
}

export class J17ReturnRefund extends BaseJourney {
  readonly id = 'J17';
  readonly name = 'Return/Refund Request';
  readonly steps: JourneyStep[];

  private returnOrderId = 'ORD-10021'; // Pre-seeded eligible order for alice

  constructor(config: ReturnPortalConfig) {
    super(config as unknown as SiteConfig);
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    return [
      {
        name: 'Navigate to return portal',
        goal: 'Navigate to the return portal homepage, which should redirect to the login page.',
        execute: async (page: Page) => {
          await page.goto(RETURN_PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          // Should redirect to login
          await page.waitForSelector('#login-form', { timeout: 10000 });
        },
      },
      {
        name: 'Login with pre-seeded user',
        goal: "Fill in email='alice@example.com' and password='password123', then click the Login button.",
        execute: async (page: Page) => {
          await page.fill('#email', 'alice@example.com');
          await page.fill('#password', 'password123');
          await page.click('#login-btn');
          await page.waitForSelector('.order-card', { timeout: 10000 });
        },
      },
      {
        name: 'View order history',
        goal: 'Verify the order history page is loaded and shows order cards.',
        execute: async (page: Page) => {
          // Verify order history loaded
          const cards = await page.$$('.order-card');
          if (cards.length === 0) throw new Error('No order cards found in order history');
        },
      },
      {
        name: 'Select eligible order for return',
        goal: 'Find and click the return button for order ORD-10021 to open the return form.',
        execute: async (page: Page) => {
          // Click return on the eligible order (ORD-10021)
          const returnBtn = await page.$(`#return-btn-${this.returnOrderId}`);
          if (!returnBtn) throw new Error(`Return button for ${this.returnOrderId} not found`);
          await returnBtn.click();
          await page.waitForSelector('#return-form', { timeout: 10000 });
        },
      },
      {
        name: 'Fill return reason and refund method',
        goal: "Select return_reason='defective', fill return_notes='The product stopped working after 3 days.', and select return_method='original'.",
        execute: async (page: Page) => {
          await page.selectOption('#return_reason', 'defective');
          await page.fill('#return_notes', 'The product stopped working after 3 days.');
          await page.selectOption('#return_method', 'original');
        },
      },
      {
        name: 'Submit return request and check eligibility',
        goal: 'Click the Check Eligibility button and verify the order is approved for return (not shown as ineligible).',
        execute: async (page: Page) => {
          await page.click('#check-eligibility-btn');
          // Should redirect to eligible page since ORD-10021 is eligible
          await page.waitForSelector('#eligibility-approved, #ineligible-message', { timeout: 10000 });
          const ineligible = await page.$('#ineligible-message');
          if (ineligible) {
            const msg = await ineligible.textContent();
            throw new Error(`Order marked ineligible unexpectedly: ${msg}`);
          }
        },
      },
      {
        name: 'Verify return label is generated',
        goal: "Verify a return label is shown with a reference number starting with 'RTN-'.",
        execute: async (page: Page) => {
          await page.waitForSelector('#return-label', { timeout: 10000 });
          const label = await page.textContent('#return-label');
          if (!label?.includes('RTN-')) throw new Error('Return label reference number not found');
        },
      },
      {
        name: 'Confirm return shipment',
        goal: 'Click the Confirm Return button to finalize the return shipment.',
        execute: async (page: Page) => {
          await page.click('#confirm-return-btn');
          await page.waitForSelector('#return-confirmed', { timeout: 10000 });
        },
      },
      {
        name: 'Verify confirmation number',
        goal: "Verify the final confirmation number is displayed and starts with 'CONF-'.",
        execute: async (page: Page) => {
          const confirmRef = await page.textContent('#confirmation-number');
          if (!confirmRef?.startsWith('CONF-')) {
            throw new Error(`Invalid confirmation number: ${confirmRef}`);
          }
        },
      },
    ];
  }
}
