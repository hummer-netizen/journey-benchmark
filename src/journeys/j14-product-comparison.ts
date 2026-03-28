import type { Page } from 'playwright';
import type { JourneyStep, SiteConfig } from '../types.js';
import { BaseJourney } from './base.js';

interface ProductInfo {
  name: string;
  price: number;
  priceText: string;
}

export class J14ProductComparison extends BaseJourney {
  id = 'J14';
  name = 'Product Comparison';
  steps: JourneyStep[];
  private products: ProductInfo[] = [];

  constructor(config: SiteConfig) {
    super(config);
    this.steps = this.buildSteps();
  }

  private async extractProductInfo(page: Page): Promise<ProductInfo> {
    const { selectors } = this.config;

    // Wait for product page to load
    await page.waitForSelector(selectors.productTitle, { timeout: 15000 });

    const name = await page.$eval(
      selectors.productTitle,
      el => el.textContent?.trim() ?? '',
    ).catch(() => 'Unknown Product');

    // Try multiple price selectors
    let priceText = '';
    for (const sel of [selectors.productPrice, '.product__price', '.current-price', '[itemprop="price"]', '.price']) {
      try {
        priceText = await page.$eval(sel, el => el.textContent?.trim() ?? '');
        if (priceText) break;
      } catch { /* selector not found, try next */ }
    }

    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
    return { name, price, priceText: priceText || 'N/A' };
  }

  private buildSteps(): JourneyStep[] {
    const { baseUrl, selectors } = this.config;

    return [
      {
        name: 'Navigate to homepage',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
        },
      },
      {
        name: 'Open first product and note details',
        execute: async (page: Page) => {
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) {
            throw new Error(`Need at least 2 products on homepage, found ${links.length}`);
          }
          await links[0]!.click();
          const product = await this.extractProductInfo(page);
          this.products.push(product);
          console.log(`  Product 1: "${product.name}" at ${product.priceText}`);
        },
      },
      {
        name: 'Go back to product listing',
        execute: async (page: Page) => {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
        },
      },
      {
        name: 'Open second product and note details',
        execute: async (page: Page) => {
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) {
            throw new Error('Second product not found in listing');
          }
          await links[1]!.click();
          const product = await this.extractProductInfo(page);
          this.products.push(product);
          console.log(`  Product 2: "${product.name}" at ${product.priceText}`);
        },
      },
      {
        name: 'Compare products programmatically',
        execute: async (_page: Page) => {
          if (this.products.length < 2) {
            throw new Error('Fewer than 2 products recorded for comparison');
          }
          const [p1, p2] = this.products as [ProductInfo, ProductInfo];
          console.log(`  Comparing: "${p1.name}" (${p1.priceText}) vs "${p2.name}" (${p2.priceText})`);
          if (p1.price === 0 && p2.price === 0) {
            throw new Error('Could not parse prices for either product');
          }
        },
      },
      {
        name: 'Navigate to cheaper product',
        execute: async (page: Page) => {
          const [p1, p2] = this.products as [ProductInfo, ProductInfo];
          const cheaperIndex = p1.price <= p2.price ? 0 : 1;
          const cheaper = this.products[cheaperIndex]!;
          console.log(`  Selected cheaper: "${cheaper.name}" at ${cheaper.priceText}`);

          // Go back to listing and click the correct product
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          const links = await page.$$(selectors.productLink);
          await links[cheaperIndex]!.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
        },
      },
      {
        name: 'Add selected product to cart',
        execute: async (page: Page) => {
          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Verify cart contains product',
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
            throw new Error('Cart appears empty after adding product');
          }
        },
      },
    ];
  }
}
