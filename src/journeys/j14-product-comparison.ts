import type { Page } from 'playwright';
import type { JourneyStep, SiteConfig } from '../types.js';
import { BaseJourney } from './base.js';

interface ProductInfo {
  name: string;
  price: number;
  priceText: string;
  index: number;
}

export class J14ProductComparison extends BaseJourney {
  id = 'J14';
  name = 'Product Comparison';
  steps: JourneyStep[];
  private products: ProductInfo[] = [];
  private searchResultsUrl = '';

  constructor(config: SiteConfig) {
    super(config);
    this.steps = this.buildSteps();
  }

  private async extractProductInfo(page: Page, index: number): Promise<ProductInfo> {
    const { selectors } = this.config;
    const isMagento = process.env['SITE_TYPE'] !== 'prestashop';

    const titleSel = isMagento
      ? 'h1.page-title .base, h1.product-name, h1[itemprop="name"]'
      : selectors.productTitle;

    const name = await page.$eval(
      titleSel,
      el => el.textContent?.trim() ?? '',
    ).catch(() => 'Product ' + (index + 1));

    // Try multiple price selectors
    let priceText = '';
    const priceSelectors = isMagento
      ? ['.price-box .price', '[data-price-type="finalPrice"] .price', '.price-final_price .price', selectors.productPrice]
      : [selectors.productPrice, '.product__price', '.current-price', '[itemprop="price"]', '.price'];

    for (const sel of priceSelectors) {
      try {
        priceText = await page.$eval(sel, el => el.textContent?.trim() ?? '');
        if (priceText) break;
      } catch { /* try next */ }
    }

    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
    return { name, price, priceText: priceText || 'N/A', index };
  }

  private buildSteps(): JourneyStep[] {
    const { baseUrl, selectors } = this.config;
    const isMagento = process.env['SITE_TYPE'] !== 'prestashop';

    return [
      {
        name: 'Search for products',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.searchInput, { timeout: 20000 });
          // Use search to find products (WebArena homepage is CMS, no product grid)
          const searchInput = await page.$(selectors.searchInput);
          if (!searchInput) throw new Error('Search input not found');
          await searchInput.fill(isMagento ? 'lamp' : 'mug');
          await searchInput.press('Enter');
          await page.waitForSelector(selectors.productLink, { timeout: 20000 });

          // Verify at least 2 products available
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) {
            throw new Error(`Need at least 2 products, found ${links.length}`);
          }
          // Save the search results URL for later navigation (goBack unreliable in proxy frames)
          this.searchResultsUrl = page.url();
        },
      },
      {
        name: 'Open first product and record details',
        execute: async (page: Page) => {
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) throw new Error(`Need at least 2 products, found ${links.length}`);
          // Use goto(href) so proxy-frame navigation is reliable (link clicks may not navigate in Surfly)
          const href = await links[0]!.getAttribute('href');
          if (href) {
            await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else {
            await links[0]!.click();
          }
          await page.waitForSelector(isMagento ? '.price-box' : selectors.productPrice, { timeout: 20000 });
          const product = await this.extractProductInfo(page, 0);
          this.products.push(product);
          console.log(`  Product 1: "${product.name}" at ${product.priceText}`);
        },
      },
      {
        name: 'Return to product listing',
        execute: async (page: Page) => {
          // Use goto instead of goBack — goBack is unreliable in proxy frames (Surfly)
          await page.goto(this.searchResultsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
        },
      },
      {
        name: 'Open second product and record details',
        execute: async (page: Page) => {
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) throw new Error('Second product not found in listing');
          // Use goto(href) so proxy-frame navigation is reliable
          const href = await links[1]!.getAttribute('href');
          if (href) {
            await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else {
            await links[1]!.click();
          }
          await page.waitForSelector(isMagento ? '.price-box' : selectors.productPrice, { timeout: 20000 });
          const product = await this.extractProductInfo(page, 1);
          this.products.push(product);
          console.log(`  Product 2: "${product.name}" at ${product.priceText}`);
        },
      },
      {
        name: 'Compare products and identify cheaper',
        execute: async (_page: Page) => {
          if (this.products.length < 2) throw new Error('Fewer than 2 products recorded');
          const [p1, p2] = this.products as [ProductInfo, ProductInfo];
          console.log(`  Comparing: "${p1.name}" (${p1.priceText}) vs "${p2.name}" (${p2.priceText})`);
          if (p1.price === 0 && p2.price === 0) {
            throw new Error('Could not parse prices for either product — price extraction failed');
          }
          const cheaper = p1.price <= p2.price ? p1 : p2;
          console.log(`  Cheaper product: "${cheaper.name}" at ${cheaper.priceText}`);
        },
      },
      {
        name: 'Navigate to cheaper product',
        execute: async (page: Page) => {
          const [p1, p2] = this.products as [ProductInfo, ProductInfo];
          const cheaperIndex = p1.price <= p2.price ? 0 : 1;
          const cheaper = this.products[cheaperIndex]!;

          // Navigate back to search results (goto is reliable; goBack is not in proxy frames)
          await page.goto(this.searchResultsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          const links = await page.$$(selectors.productLink);
          // Use goto(href) so proxy-frame navigation is reliable
          const href = await links[cheaperIndex]!.getAttribute('href');
          if (href) {
            await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          } else {
            await links[cheaperIndex]!.click();
          }
          await page.waitForSelector(selectors.addToCartButton, { timeout: 20000 });
          console.log(`  Selected: "${cheaper.name}"`);
        },
      },
      {
        name: 'Add cheaper product to cart',
        execute: async (page: Page) => {
          if (isMagento) {
            // Handle swatch-style configurable options
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
            // Handle custom option radio buttons (e.g. color options as radios)
            const customOptionRadios = await page.$$('.product-custom-option input[type="radio"]:visible, input[name^="options["]:visible');
            if (customOptionRadios.length > 0) {
              await customOptionRadios[0]!.click().catch(() => {});
              await page.waitForTimeout(300);
            }
            // Handle custom option dropdowns
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
        name: 'Verify cart contains selected product',
        execute: async (page: Page) => {
          const cartUrl = isMagento ? `${baseUrl}/checkout/cart/` : `${baseUrl}/cart`;
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
          if (!hasItems) throw new Error('Cart appears empty after adding cheaper product');
        },
      },
    ];
  }
}
