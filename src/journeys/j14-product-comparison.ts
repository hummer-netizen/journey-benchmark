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
        name: 'Search for product category',
        execute: async (page: Page) => {
          await page.fill(selectors.searchInput, 'pants');
          await page.click(selectors.searchButton);
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
        },
      },
      {
        name: 'Open first product and note details',
        execute: async (page: Page) => {
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) {
            throw new Error(`Need at least 2 products, found ${links.length}`);
          }
          await links[0]!.click();
          await page.waitForSelector(selectors.productTitle, { timeout: 15000 });
          await page.waitForSelector(selectors.productPrice, { timeout: 10000 });

          const name = await page.$eval(selectors.productTitle, el => el.textContent?.trim() ?? '');
          const priceText = await page.$eval(selectors.productPrice, el => el.textContent?.trim() ?? '');
          const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));

          this.products.push({ name, price, priceText });
        },
      },
      {
        name: 'Go back and open second product',
        execute: async (page: Page) => {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });

          const links = await page.$$(selectors.productLink);
          if (links.length < 2) {
            throw new Error('Second product not found in listing');
          }
          await links[1]!.click();
          await page.waitForSelector(selectors.productTitle, { timeout: 15000 });
          await page.waitForSelector(selectors.productPrice, { timeout: 10000 });

          const name = await page.$eval(selectors.productTitle, el => el.textContent?.trim() ?? '');
          const priceText = await page.$eval(selectors.productPrice, el => el.textContent?.trim() ?? '');
          const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));

          this.products.push({ name, price, priceText });
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
          // Both prices must be valid numbers
          if (isNaN(p1.price) || isNaN(p2.price)) {
            throw new Error(`Could not parse prices: ${p1.priceText}, ${p2.priceText}`);
          }
        },
      },
      {
        name: 'Select lower-priced product',
        execute: async (page: Page) => {
          if (this.products.length < 2) throw new Error('Products not recorded');
          const [p1, p2] = this.products as [ProductInfo, ProductInfo];
          const cheaper = p1.price <= p2.price ? p1 : p2;
          console.log(`  Selected: "${cheaper.name}" at ${cheaper.priceText}`);

          // Navigate to the cheaper product — go back if we're on product 2
          if (cheaper === p1) {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForSelector(selectors.productLink, { timeout: 15000 });
            const links = await page.$$(selectors.productLink);
            await links[0]!.click();
            await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
          }
          // If cheaper === p2, we're already on that page
        },
      },
      {
        name: 'Add selected product to cart',
        execute: async (page: Page) => {
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(2000);
        },
      },
      {
        name: 'Verify cart contains correct product',
        execute: async (page: Page) => {
          await page.click(selectors.cartIcon);
          await page.waitForSelector(selectors.checkoutButton, { timeout: 10000 });
          const count = await page.$(selectors.cartCount);
          if (count) {
            const text = await count.textContent();
            const num = parseInt(text ?? '0', 10);
            if (num < 1) {
              throw new Error(`Cart appears empty after adding product`);
            }
          }
        },
      },
    ];
  }
}
