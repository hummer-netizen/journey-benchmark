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
        goal: 'Navigate to the shop homepage and wait for the search bar to appear.',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.searchInput, { timeout: 20000 });
        },
      },
      {
        name: 'Search and add item to cart',
        goal: "Search for 'book', click the first product result, select any required options (size/color), and click Add to Cart.",
        execute: async (page: Page) => {
          const searchInput = await page.$(selectors.searchInput);
          if (!searchInput) throw new Error('Search input not found');
          await searchInput.fill(isMagento ? 'book' : 'mug');
          await searchInput.press('Enter');
          await page.waitForSelector(selectors.productLink, { timeout: 20000 });
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product found in search results');
          // Click the product link directly (works with both direct and Surfly proxy)
          await link.click();
          await page.waitForTimeout(2000);
          await page.waitForSelector(selectors.addToCartButton, { timeout: 20000 });

          // Select options if configurable or custom-option product
          if (isMagento) {
            const sizeSwatches = await page.$$('.swatch-attribute.size .swatch-option:not(.disabled)');
            if (sizeSwatches.length > 0) {
              await sizeSwatches[0]!.click();
              await page.waitForTimeout(500);
            }
            const colorSwatches = await page.$$('.swatch-attribute.color .swatch-option:not(.disabled)');
            if (colorSwatches.length > 0) {
              await colorSwatches[0]!.click();
              await page.waitForTimeout(500);
            }
            const customOptionRadios = await page.$$('.product-custom-option input[type="radio"]:visible, input[name^="options["]:visible');
            if (customOptionRadios.length > 0) {
              await customOptionRadios[0]!.click().catch(() => {});
              await page.waitForTimeout(300);
            }
            const customOptionSelects = await page.$$('.product-custom-option select, select[name^="options["]');
            for (const sel of customOptionSelects) {
              const opts = await sel.$$('option');
              if (opts.length > 1) {
                const val = await opts[1]!.getAttribute('value');
                if (val) await sel.selectOption(val).catch(() => {});
              }
            }
          }

          await page.click(selectors.addToCartButton);
          if (isMagento) {
            await page.waitForSelector('.message-success', { timeout: 15000 }).catch(() => {});
          }
          await page.waitForTimeout(2000);
        },
      },
      {
        name: 'Verify item in cart before session expiry',
        goal: 'Navigate to the shopping cart page and verify there is at least one item in the cart.',
        execute: async (page: Page) => {
          await page.goto(cartUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(3000);
          const hasItems = await page.waitForFunction(
            () => {
              const magento = document.querySelectorAll('.cart.item, tbody.cart.item');
              const presta = document.querySelectorAll('.cart__item, .product-line');
              return magento.length > 0 || presta.length > 0;
            },
            { timeout: 15000 },
          ).catch(() => null);
          if (!hasItems) throw new Error('Cart is empty after adding product');
        },
      },
      {
        name: 'Clear session (simulate cart expiry)',
        goal: 'Clear all browser cookies and local/session storage to simulate a session expiry.',
        execute: async (page: Page) => {
          // Clear outer Playwright context cookies (direct provider)
          const context = page.context();
          await context.clearCookies();
          // Also clear cookies and storage via JS in the page/frame context.
          // This is necessary for proxy providers (e.g. Webfuse/Surfly) where the proxied
          // session cookies are not accessible through the outer Playwright context.
          await page.evaluate(() => {
            document.cookie.split(';').forEach(c => {
              const name = c.trim().split('=')[0];
              if (name) {
                // Clear for current path/domain and root
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
              }
            });
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
          });
          console.log(`  Cart session cleared — simulating expiry`);
        },
      },
      {
        name: 'Navigate back to site after expiry',
        goal: 'Navigate back to the shop homepage after the session has been cleared.',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.searchInput, { timeout: 20000 });
        },
      },
      {
        name: 'Re-add item to cart (recovery)',
        goal: "Search for 'book' again, click the first product result, select any required options, and click Add to Cart to recover the abandoned cart.",
        execute: async (page: Page) => {
          const searchInput = await page.$(selectors.searchInput);
          if (!searchInput) throw new Error('Search input not found after session clear');
          await searchInput.fill(isMagento ? 'book' : 'mug');
          await searchInput.press('Enter');
          await page.waitForSelector(selectors.productLink, { timeout: 20000 });
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product found after session clear');
          // Click the product link directly (works with both direct and Surfly proxy)
          await link.click();
          await page.waitForTimeout(2000);
          await page.waitForSelector(selectors.addToCartButton, { timeout: 20000 });

          if (isMagento) {
            const sizeSwatches = await page.$$('.swatch-attribute.size .swatch-option:not(.disabled)');
            if (sizeSwatches.length > 0) {
              await sizeSwatches[0]!.click();
              await page.waitForTimeout(500);
            }
            const colorSwatches = await page.$$('.swatch-attribute.color .swatch-option:not(.disabled)');
            if (colorSwatches.length > 0) {
              await colorSwatches[0]!.click();
              await page.waitForTimeout(500);
            }
            const customOptionRadios = await page.$$('.product-custom-option input[type="radio"]:visible, input[name^="options["]:visible');
            if (customOptionRadios.length > 0) {
              await customOptionRadios[0]!.click().catch(() => {});
              await page.waitForTimeout(300);
            }
            const customOptionSelects = await page.$$('.product-custom-option select, select[name^="options["]');
            for (const sel of customOptionSelects) {
              const opts = await sel.$$('option');
              if (opts.length > 1) {
                const val = await opts[1]!.getAttribute('value');
                if (val) await sel.selectOption(val).catch(() => {});
              }
            }
          }

          await page.click(selectors.addToCartButton);
          if (isMagento) {
            await page.waitForSelector('.message-success', { timeout: 15000 }).catch(() => {});
          }
          await page.waitForTimeout(2000);
        },
      },
      {
        name: 'Verify cart recovered successfully',
        goal: 'Navigate to the shopping cart and confirm it contains at least one item, verifying the cart was recovered successfully.',
        execute: async (page: Page) => {
          await page.goto(cartUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(3000);
          const hasItems = await page.waitForFunction(
            () => {
              const magento = document.querySelectorAll('.cart.item, tbody.cart.item');
              const presta = document.querySelectorAll('.cart__item, .product-line');
              return magento.length > 0 || presta.length > 0;
            },
            { timeout: 15000 },
          ).catch(() => null);
          if (!hasItems) throw new Error('Cart recovery failed — cart is empty after re-adding items');
          console.log(`  Cart recovery verified`);
        },
      },
    ];
  }
}
