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
    const isMagento = process.env['SITE_TYPE'] !== 'prestashop';
    const cartUrl = isMagento ? `${baseUrl}/checkout/cart/` : `${baseUrl}/cart`;

    return [
      {
        name: 'Navigate to homepage',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(`${selectors.searchInput}, ${selectors.productLink}`, { timeout: 20000 });
        },
      },
      {
        name: 'Add item to cart',
        execute: async (page: Page) => {
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product found on homepage');
          await link.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 20000 });

          // For Magento: may need swatch selections
          if (isMagento) {
            const swatches = await page.$$('.swatch-option:not(.disabled)');
            for (const swatch of swatches.slice(0, 2)) {
              await swatch.click().catch(() => {});
              await page.waitForTimeout(300);
            }
          }

          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Verify item in cart before session expiry',
        execute: async (page: Page) => {
          await page.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const hasItems = await page.waitForFunction(
            () => {
              // Magento cart items
              const magento = document.querySelectorAll('.cart.item, .cart-item, tbody.cart.item');
              // PrestaShop cart items
              const presta = document.querySelectorAll('.cart__item, .product-line, .cart-item');
              return magento.length > 0 || presta.length > 0;
            },
            { timeout: 10000 },
          ).catch(() => null);
          if (!hasItems) throw new Error('Cart is empty after adding product');
        },
      },
      {
        name: 'Clear session (simulate cart expiry)',
        execute: async (page: Page) => {
          const context = page.context();
          await context.clearCookies();
          await page.evaluate(() => {
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
          });
          console.log(`  Cart session cleared — simulating expiry`);
        },
      },
      {
        name: 'Navigate back to site after expiry',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(`${selectors.searchInput}, ${selectors.productLink}`, { timeout: 20000 });
        },
      },
      {
        name: 'Re-add item to cart (recovery)',
        execute: async (page: Page) => {
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product found after session clear');
          await link.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 20000 });

          if (isMagento) {
            const swatches = await page.$$('.swatch-option:not(.disabled)');
            for (const swatch of swatches.slice(0, 2)) {
              await swatch.click().catch(() => {});
              await page.waitForTimeout(300);
            }
          }

          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Verify cart recovered successfully',
        execute: async (page: Page) => {
          await page.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const hasItems = await page.waitForFunction(
            () => {
              const magento = document.querySelectorAll('.cart.item, .cart-item, tbody.cart.item');
              const presta = document.querySelectorAll('.cart__item, .product-line, .cart-item');
              return magento.length > 0 || presta.length > 0;
            },
            { timeout: 10000 },
          ).catch(() => null);
          if (!hasItems) throw new Error('Cart recovery failed — cart is empty after re-adding items');
          console.log(`  Cart recovery verified`);
        },
      },
    ];
  }
}
