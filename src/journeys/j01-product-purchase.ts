import type { Page } from 'playwright';
import type { JourneyStep, SiteConfig } from '../types.js';
import { BaseJourney } from './base.js';

export class J01ProductPurchase extends BaseJourney {
  id = 'J01';
  name = 'Simple Product Purchase';
  steps: JourneyStep[];

  constructor(config: SiteConfig) {
    super(config);
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    const { baseUrl, selectors, credentials } = this.config;

    return [
      {
        name: 'Navigate to homepage',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.searchInput, { timeout: 15000 });
        },
      },
      {
        name: 'Search for a product',
        execute: async (page: Page) => {
          await page.fill(selectors.searchInput, 'shirt');
          await page.click(selectors.searchButton);
          await page.waitForSelector(selectors.productLink, { timeout: 15000 });
        },
      },
      {
        name: 'Open product detail page',
        execute: async (page: Page) => {
          await page.click(selectors.productLink);
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
          await page.waitForSelector(selectors.productTitle, { timeout: 10000 });
        },
      },
      {
        name: 'Add to cart',
        execute: async (page: Page) => {
          await page.click(selectors.addToCartButton);
          // Wait for cart count to update or success message
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
        name: 'Proceed to checkout',
        execute: async (page: Page) => {
          await page.click(selectors.checkoutButton);
          await page.waitForSelector(selectors.firstNameInput, { timeout: 20000 });
        },
      },
      {
        name: 'Fill shipping info',
        execute: async (page: Page) => {
          await page.fill(selectors.firstNameInput, credentials.firstName);
          await page.fill(selectors.lastNameInput, credentials.lastName);
          await page.fill(selectors.addressInput, credentials.address);
          await page.fill(selectors.cityInput, credentials.city);
          await page.fill(selectors.postcodeInput, credentials.postcode);
          await page.fill(selectors.phoneInput, credentials.phone);
        },
      },
      {
        name: 'Place order',
        execute: async (page: Page) => {
          await page.click(selectors.placeOrderButton);
          await page.waitForSelector(selectors.orderConfirmation, { timeout: 30000 });
        },
      },
      {
        name: 'Verify order confirmation',
        execute: async (page: Page) => {
          const confirmationEl = await page.$(selectors.orderConfirmation);
          if (!confirmationEl) {
            throw new Error('Order confirmation element not found');
          }
          const isVisible = await confirmationEl.isVisible();
          if (!isVisible) {
            throw new Error('Order confirmation not visible');
          }
        },
      },
    ];
  }
}
