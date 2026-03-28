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
    const isMagento = baseUrl.includes('7770') || process.env['SITE_TYPE'] !== 'prestashop';

    return [
      {
        name: 'Navigate to homepage',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          // Wait for product listing or search
          await page.waitForSelector(`${selectors.searchInput}, ${selectors.productLink}`, { timeout: 20000 });
        },
      },
      {
        name: 'Open a product detail page',
        execute: async (page: Page) => {
          const link = await page.$(selectors.productLink);
          if (!link) throw new Error('No product link found on homepage');
          await link.click();
          await page.waitForSelector(selectors.addToCartButton, { timeout: 20000 });
        },
      },
      {
        name: 'Add product to cart',
        execute: async (page: Page) => {
          // Magento may need size/color selection before adding to cart
          if (isMagento) {
            // Select first available size if present
            const sizeSwatches = await page.$$('[data-role="swatch-option"] [data-option-type="0"], .swatch-option.size, .swatch-attribute.size .swatch-option');
            if (sizeSwatches.length > 0) {
              await sizeSwatches[0]!.click();
              await page.waitForTimeout(500);
            }
            // Select first available color if present
            const colorSwatches = await page.$$('.swatch-option.color, .swatch-attribute.color .swatch-option');
            if (colorSwatches.length > 0) {
              await colorSwatches[0]!.click();
              await page.waitForTimeout(500);
            }
          }
          await page.click(selectors.addToCartButton);
          await page.waitForTimeout(3000);
          // Wait for cart indicator update
          if (isMagento) {
            await page.waitForSelector('.counter-number, .minicart-quantity', { timeout: 10000 }).catch(() => {});
          }
        },
      },
      {
        name: 'Proceed to checkout',
        execute: async (page: Page) => {
          if (isMagento) {
            // Click mini-cart icon then proceed to checkout
            await page.click(selectors.cartIcon).catch(() => {});
            await page.waitForTimeout(1000);
            const checkoutBtn = await page.$(selectors.checkoutButton);
            if (checkoutBtn) {
              await checkoutBtn.click();
            } else {
              await page.goto(`${baseUrl}/checkout/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            }
          } else {
            await page.goto(`${baseUrl}/order`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          }
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Fill shipping information (guest checkout)',
        execute: async (page: Page) => {
          if (isMagento) {
            // Magento checkout — fill email for guest
            await page.waitForSelector('#customer-email, #guest-email', { timeout: 20000 }).catch(() => {});
            const emailField = await page.$('#customer-email, #guest-email, input[name="username"]');
            if (emailField) {
              const ts = Date.now();
              await emailField.fill(`bench_${ts}@example.com`);
              await page.waitForTimeout(500);
            }

            // Fill address fields
            await page.fill(selectors.firstNameInput, credentials.firstName).catch(() => {});
            await page.fill(selectors.lastNameInput, credentials.lastName).catch(() => {});
            await page.fill(selectors.addressInput, credentials.address).catch(() => {});
            await page.fill(selectors.cityInput, credentials.city).catch(() => {});

            // Select state
            const stateSelect = await page.$(selectors.stateInput);
            if (stateSelect) {
              await stateSelect.selectOption({ label: credentials.state }).catch(async () => {
                const opts = await stateSelect.$$('option');
                for (const opt of opts) {
                  const val = await opt.getAttribute('value');
                  if (val && val !== '0' && val !== '') {
                    await stateSelect.selectOption(val);
                    break;
                  }
                }
              });
            }

            await page.fill(selectors.postcodeInput, credentials.postcode).catch(() => {});
            await page.fill(selectors.phoneInput, credentials.phone).catch(() => {});
            await page.waitForTimeout(1000);
          } else {
            // PrestaShop — guest checkout flow
            // Step 1: Personal info
            await page.waitForSelector('input[name="firstname"]', { timeout: 15000 });
            await page.fill('input[name="firstname"]', credentials.firstName);
            await page.fill('input[name="lastname"]', credentials.lastName);
            const ts = Date.now();
            const emailInput = await page.$('#field-email');
            if (emailInput) await emailInput.fill(`bench_${ts}@example.com`);
            for (const checkName of ['psgdpr', 'customer_privacy']) {
              const cb = await page.$(`input[name="${checkName}"]`);
              if (cb && await cb.isVisible()) await cb.check();
            }
            await page.click('button[data-link-action="register-new-customer"]');
            await page.waitForTimeout(3000);

            // Step 2: Fill delivery address
            await page.waitForSelector('input[name="address1"]', { timeout: 10000 });
            await page.fill('input[name="address1"]', credentials.address);
            await page.fill('input[name="city"]', credentials.city);
            await page.fill('input[name="postcode"]', credentials.postcode);

            // Select state (required for US addresses in PrestaShop)
            const stateSelect = await page.$('select[name="id_state"]');
            if (stateSelect) {
              await stateSelect.selectOption({ label: credentials.state }).catch(async () => {
                // Fallback: select first non-empty option
                const opts = await stateSelect.$$('option');
                for (const opt of opts) {
                  const val = await opt.getAttribute('value');
                  if (val && val !== '' && val !== '0') {
                    await stateSelect.selectOption(val);
                    break;
                  }
                }
              });
            }

            const phoneInput = await page.$('input[name="phone"]');
            if (phoneInput && await phoneInput.isVisible()) {
              await phoneInput.fill(credentials.phone);
            }

            // Confirm address
            await page.click('button[name="confirm-addresses"]');
            await page.waitForTimeout(3000);
          }
        },
      },
      {
        name: 'Select shipping method',
        execute: async (page: Page) => {
          if (isMagento) {
            // Wait for shipping methods to appear
            await page.waitForSelector('.table-checkout-shipping-method, [data-th="Carrier"]', { timeout: 15000 }).catch(() => {});
            // Click first available shipping method
            const shippingMethod = await page.$('input[name="ko_unique_1"], input[name="shipping_method"]');
            if (shippingMethod) {
              await shippingMethod.check().catch(() => {});
            }
            await page.waitForTimeout(1000);
            // Click "Next" button
            const nextBtn = await page.$('button.continue, .button-action.action.continue, button[data-role="opc-continue"]');
            if (nextBtn) await nextBtn.click();
            await page.waitForTimeout(2000);
          } else {
            await page.waitForSelector('button[name="confirmDeliveryOption"]', { timeout: 10000 });
            await page.click('button[name="confirmDeliveryOption"]');
            await page.waitForTimeout(3000);
          }
        },
      },
      {
        name: 'Complete payment and place order',
        execute: async (page: Page) => {
          if (isMagento) {
            // Wait for payment step
            await page.waitForSelector('#checkout-payment-method-load, .payment-methods', { timeout: 20000 }).catch(() => {});

            // Select "Check / Money order" (free option in WebArena)
            const checkmo = await page.$('#checkmo, input[value="checkmo"]');
            if (checkmo) await checkmo.click().catch(() => {});

            await page.waitForTimeout(1000);

            // Click "Place Order"
            const placeOrderBtn = await page.$('.checkout.action.primary, button.action.primary.checkout, ' + selectors.placeOrderButton);
            if (!placeOrderBtn) throw new Error('Place Order button not found');
            await placeOrderBtn.click();
            await page.waitForTimeout(10000);
          } else {
            const paymentOption = await page.$('input[name="payment-option"]');
            if (paymentOption) {
              await paymentOption.check();
              await page.waitForTimeout(1000);
            }
            const tosCheckbox = await page.$('input[name="conditions_to_approve[terms-and-conditions]"]');
            if (tosCheckbox && await tosCheckbox.isVisible()) await tosCheckbox.check();
            await page.click('#payment-confirmation button[type="submit"]');
            await page.waitForTimeout(8000);
          }
        },
      },
      {
        name: 'Verify order confirmation',
        execute: async (page: Page) => {
          const url = page.url();
          if (url.includes('order-confirmation') || url.includes('checkout/success') || url.includes('onepage/success')) return;

          const confirmed = await page.waitForSelector(
            '.checkout-success, h1:has-text("Thank you"), .page-title:has-text("Thank you"), #order-confirmation, .order-confirmation, .alert-success',
            { timeout: 15000 },
          ).catch(() => null);

          if (!confirmed) {
            const bodyText = await page.$eval('body', el => el.innerText.substring(0, 300)).catch(() => '');
            throw new Error(`Order confirmation not found. URL: ${url}\nPage: ${bodyText}`);
          }
        },
      },
    ];
  }
}
