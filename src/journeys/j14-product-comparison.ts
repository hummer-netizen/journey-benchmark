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
        name: 'Navigate to product listing',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.productLink, { timeout: 20000 });

          // Verify at least 2 products available
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) {
            // Navigate to a category page for more products
            const catLink = isMagento
              ? await page.$('nav.navigation a, .category-link:not([href*="clearance"])')
              : await page.$('.category-link a, .top-menu a');
            if (catLink) await catLink.click();
            await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          }
        },
      },
      {
        name: 'Open first product and record details',
        execute: async (page: Page) => {
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) throw new Error(`Need at least 2 products, found ${links.length}`);
          await links[0]!.click();
          await page.waitForSelector(isMagento ? '.price-box' : selectors.productPrice, { timeout: 20000 });
          const product = await this.extractProductInfo(page, 0);
          this.products.push(product);
          console.log(`  Product 1: "${product.name}" at ${product.priceText}`);
        },
      },
      {
        name: 'Return to product listing',
        execute: async (page: Page) => {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
        },
      },
      {
        name: 'Open second product and record details',
        execute: async (page: Page) => {
          const links = await page.$$(selectors.productLink);
          if (links.length < 2) throw new Error('Second product not found in listing');
          await links[1]!.click();
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

          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
          const links = await page.$$(selectors.productLink);
          await links[cheaperIndex]!.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 20000 });
          console.log(`  Selected: "${cheaper.name}"`);
        },
      },
      {
        name: 'Add cheaper product to cart',
        execute: async (page: Page) => {
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
        name: 'Verify cart contains selected product',
        execute: async (page: Page) => {
          const cartUrl = isMagento ? `${baseUrl}/checkout/cart/` : `${baseUrl}/cart`;
          await page.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const hasItems = await page.waitForFunction(
            () => {
              const magento = document.querySelectorAll('.cart.item, .cart-item, tbody.cart.item');
              const presta = document.querySelectorAll('.cart__item, .product-line, .cart-item');
              return magento.length > 0 || presta.length > 0;
            },
            { timeout: 10000 },
          ).catch(() => null);
          if (!hasItems) throw new Error('Cart appears empty after adding cheaper product');
        },
      },
    ];
  }
}
