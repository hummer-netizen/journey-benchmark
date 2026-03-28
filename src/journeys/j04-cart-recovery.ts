import type { Page } from 'playwright';
import type { JourneyStep, SiteConfig } from '../types.js';
import { BaseJourney } from './base.js';

export class J04CartRecovery extends BaseJourney {
  id = 'J04';
  name = 'Cart Recovery (Expired Session)';
  steps: JourneyStep[];

  constructor(config: SiteConfig) {
    super(config);
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    const { baseUrl, selectors } = this.config;

    return [
      {
        name: 'Navigate to homepage',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.searchInput, { timeout: 15000 });
        },
      },
      {
        name: 'Add items to cart',
        execute: async (page: Page) => {
          // Search and add first result to cart
          await page.fill(selectors.searchInput, 'jacket');
          await page.click(selectors.searchButton);
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          await page.click(selectors.productLink);
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(2000);
        },
      },
      {
        name: 'Clear cookies/session (simulate expiry)',
        execute: async (page: Page) => {
          const context = page.context();
          await context.clearCookies();
          // Also clear localStorage to simulate full session expiry
          await page.evaluate(() => {
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
          });
        },
      },
      {
        name: 'Navigate back to site',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.searchInput, { timeout: 15000 });
        },
      },
      {
        name: 'Re-add items to cart',
        execute: async (page: Page) => {
          await page.fill(selectors.searchInput, 'jacket');
          await page.click(selectors.searchButton);
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          await page.click(selectors.productLink);
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(2000);
        },
      },
      {
        name: 'Go to cart',
        execute: async (page: Page) => {
          await page.click(selectors.cartIcon);
          await page.waitForSelector(selectors.checkoutButton, { timeout: 10000 });
        },
      },
      {
        name: 'Verify cart has items',
        execute: async (page: Page) => {
          const count = await page.$(selectors.cartCount);
          if (count) {
            const text = await count.textContent();
            const num = parseInt(text ?? '0', 10);
            if (num < 1) {
              throw new Error(`Expected at least 1 item in cart, got ${num}`);
            }
          }
          // Verify checkout button exists (cart is not empty)
          const checkoutBtn = await page.$(selectors.checkoutButton);
          if (!checkoutBtn) {
            throw new Error('Cart appears to be empty — cart recovery failed');
          }
        },
      },
    ];
  }
}
