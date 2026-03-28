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
        name: 'Search and add item to cart',
        execute: async (page: Page) => {
          // Navigate to a product directly
          const productLinks = await page.$$(selectors.productLink);
          if (productLinks.length === 0) {
            // Try searching
            await page.fill(selectors.searchInput, 'sweater');
            if (selectors.searchButton) {
              await page.click(selectors.searchButton);
            } else {
              await page.press(selectors.searchInput, 'Enter');
            }
            await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          }
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product found');
          await link.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Verify item in cart before clearing',
        execute: async (page: Page) => {
          await page.goto(`${baseUrl}/cart`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          // Verify cart has at least one item
          const hasItems = await page.waitForFunction(
            () => {
              const items = document.querySelectorAll('.cart__item, .product-line, .cart-item');
              return items.length > 0;
            },
            { timeout: 10000 },
          ).catch(() => null);
          if (!hasItems) {
            throw new Error('Cart is empty after adding product');
          }
        },
      },
      {
        name: 'Clear cookies/session (simulate expiry)',
        execute: async (page: Page) => {
          const context = page.context();
          await context.clearCookies();
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
        name: 'Re-add item to cart',
        execute: async (page: Page) => {
          const productLinks = await page.$$(selectors.productLink);
          if (productLinks.length === 0) {
            await page.fill(selectors.searchInput, 'sweater');
            if (selectors.searchButton) {
              await page.click(selectors.searchButton);
            } else {
              await page.press(selectors.searchInput, 'Enter');
            }
            await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          }
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product found after session clear');
          await link.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Verify cart has items after recovery',
        execute: async (page: Page) => {
          await page.goto(`${baseUrl}/cart`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const hasItems = await page.waitForFunction(
            () => {
              const items = document.querySelectorAll('.cart__item, .product-line, .cart-item');
              return items.length > 0;
            },
            { timeout: 10000 },
          ).catch(() => null);
          if (!hasItems) {
            throw new Error('Cart recovery failed — cart is empty after re-adding items');
          }
        },
      },
    ];
  }
}
