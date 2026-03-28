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
        name: 'Open a product detail page',
        execute: async (page: Page) => {
          // Click first product from homepage listing
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product link found on homepage');
          await link.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 15000 });
        },
      },
      {
        name: 'Add product to cart',
        execute: async (page: Page) => {
          await page.click(selectors.addToCartButton);
          // Wait for cart modal or header count to update
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Navigate to checkout',
        execute: async (page: Page) => {
          // Go directly to order page
          await page.goto(`${baseUrl}/order`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          // Wait for personal info step to load
          await page.waitForSelector('input[name="firstname"]', { timeout: 15000 });
        },
      },
      {
        name: 'Fill personal information (guest checkout)',
        execute: async (page: Page) => {
          await page.fill('input[name="firstname"]', credentials.firstName);
          await page.fill('input[name="lastname"]', credentials.lastName);

          // Use a timestamped email to avoid duplicate account errors
          const ts = Date.now();
          const email = `bench_${ts}@example.com`;
          await page.fill('#field-email', email);

          // Accept GDPR / privacy checkboxes (check all visible ones)
          for (const checkName of ['psgdpr', 'customer_privacy']) {
            const cb = await page.$(`input[name="${checkName}"]`);
            if (cb && await cb.isVisible()) {
              await cb.check();
            }
          }

          // Click "Continue" / register as guest
          await page.click('button[data-link-action="register-new-customer"]');
          await page.waitForTimeout(3000);

          // Verify we advanced to addresses step
          const addressInput = await page.$('input[name="address1"]');
          if (!addressInput) throw new Error('Did not advance to addresses step after personal info');
        },
      },
      {
        name: 'Fill delivery address',
        execute: async (page: Page) => {
          await page.waitForSelector('input[name="address1"]', { timeout: 10000 });
          await page.fill('input[name="address1"]', credentials.address);
          await page.fill('input[name="city"]', credentials.city);
          await page.fill('input[name="postcode"]', credentials.postcode);

          // Select state
          const stateSelect = await page.$('select[name="id_state"]');
          if (stateSelect) {
            await stateSelect.selectOption({ label: credentials.state }).catch(async () => {
              // Fallback: pick first non-empty option
              const options = await stateSelect.$$('option');
              for (const opt of options) {
                const val = await opt.getAttribute('value');
                if (val && val !== '0') {
                  await stateSelect.selectOption(val);
                  break;
                }
              }
            });
          }

          // Phone (optional in PrestaShop but fill if visible)
          const phoneInput = await page.$(selectors.phoneInput);
          if (phoneInput && await phoneInput.isVisible()) {
            await phoneInput.fill(credentials.phone);
          }

          // Click "Continue" (confirm-addresses)
          await page.click('button[name="confirm-addresses"]');
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Confirm shipping method',
        execute: async (page: Page) => {
          // Shipping step — just click continue (first carrier pre-selected)
          await page.waitForSelector('button[name="confirmDeliveryOption"]', { timeout: 10000 });
          await page.click('button[name="confirmDeliveryOption"]');
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Complete payment and place order',
        execute: async (page: Page) => {
          // Select first payment option
          const paymentOption = await page.$('input[name="payment-option"]');
          if (paymentOption) {
            await paymentOption.check();
            await page.waitForTimeout(1000);
          }

          // Accept terms of service
          const tosCheckbox = await page.$('input[name="conditions_to_approve[terms-and-conditions]"]');
          if (tosCheckbox && await tosCheckbox.isVisible()) {
            await tosCheckbox.check();
          }

          // Place order
          await page.click('#payment-confirmation button[type="submit"]');
          await page.waitForTimeout(8000);
        },
      },
      {
        name: 'Verify order confirmation',
        execute: async (page: Page) => {
          const url = page.url();
          // PrestaShop redirects to /order-confirmation on success
          if (url.includes('order-confirmation')) return;

          // Also try waiting for confirmation element
          const confirmed = await page.waitForSelector(
            '#order-confirmation, .order-confirmation, h3:has-text("confirmed"), .alert-success',
            { timeout: 10000 },
          ).catch(() => null);

          if (!confirmed) {
            const bodyText = await page.$eval('body', el => el.innerText.substring(0, 300));
            throw new Error(`Order confirmation not found. URL: ${url}\nPage: ${bodyText}`);
          }
        },
      },
    ];
  }
}
