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
        goal: 'Navigate to the shop homepage and wait for the search bar to appear.',
        execute: async (page: Page) => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(selectors.searchInput, { timeout: 20000 });
        },
      },
      {
        name: 'Search and open a product detail page',
        goal: "Type 'book' into the search bar and press Enter, then click the first product link in the search results to open its detail page.",
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
        },
      },
      {
        name: 'Add product to cart',
        goal: 'If the product has size or color options, select the first available option for each. Then click the Add to Cart button.',
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
            // Handle custom option radio buttons
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
          // Wait for success message (Magento shows it after AJAX add-to-cart)
          if (isMagento) {
            await page.waitForSelector('.message-success', { timeout: 15000 }).catch(() => {});
          }
          await page.waitForTimeout(2000);
        },
      },
      {
        name: 'Proceed to checkout',
        goal: 'Navigate to the checkout page.',
        execute: async (page: Page) => {
          if (isMagento) {
            // Navigate directly to checkout (more reliable than mini-cart click)
            await page.goto(`${baseUrl}/checkout/`, { waitUntil: 'networkidle', timeout: 60000 });
            // Wait for Knockout.js to render the checkout form (element may be present but hidden)
            await page.waitForSelector('#customer-email', { timeout: 30000 }).catch(() => {});
            // Extra wait for KO.js in proxy environments
            await page.waitForTimeout(3000);
            // Force-show the email field and shipping step if KO.js hasn't made them visible
            await page.evaluate(() => {
              const shippingStep = document.querySelector('#checkout-step-shipping') as HTMLElement | null;
              if (shippingStep) {
                shippingStep.style.display = 'block';
                shippingStep.style.visibility = 'visible';
              }
              const emailEl = document.querySelector('#customer-email') as HTMLElement | null;
              if (emailEl) {
                emailEl.style.display = 'block';
                emailEl.style.visibility = 'visible';
                emailEl.style.opacity = '1';
                // Un-hide any ancestors that may be keeping it hidden
                let node: HTMLElement | null = emailEl.parentElement;
                while (node && node.tagName !== 'BODY') {
                  if (node.style.display === 'none') node.style.display = 'block';
                  if (node.style.visibility === 'hidden') node.style.visibility = 'visible';
                  node = node.parentElement;
                }
              }
            }).catch(() => {});
            // Final visibility check (best-effort; fill will work even if this times out)
            await page.waitForSelector('#customer-email', { state: 'visible', timeout: 10000 }).catch(() => {});
          } else {
            await page.goto(`${baseUrl}/order`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          }
        },
      },
      {
        name: 'Fill shipping information (guest checkout)',
        goal: "Fill the guest checkout shipping form with: email=bench_test@example.com, firstName=Test, lastName=User, address=123 Main St, city=Anytown, state=California, postcode=90210, phone=5555555555.",
        execute: async (page: Page) => {
          if (isMagento) {
            // Fill email — this triggers KO to evaluate the "existing customer" check
            const emailField = await page.$('#customer-email');
            if (emailField) {
              const ts = Date.now();
              await emailField.fill(`bench_${ts}@example.com`);
              // Trigger KO observable update by firing blur; this shows the shipping address form
              await page.evaluate(() => {
                const el = document.querySelector('#customer-email') as HTMLInputElement | null;
                if (el) {
                  el.dispatchEvent(new Event('blur', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }).catch(() => {});
              await page.waitForTimeout(2000);
            }

            // Wait for KO to render the shipping address form fields
            await page.waitForSelector('input[name="firstname"]', { timeout: 30000 }).catch(() => {});
            // Force-show shipping form container if KO hasn't rendered it yet
            await page.evaluate(() => {
              const form = document.querySelector('form.form-shipping-address, .shipping-address-form, fieldset.fieldset') as HTMLElement | null;
              if (form) {
                form.style.display = 'block';
                form.style.visibility = 'visible';
              }
              ['firstname', 'lastname', 'street[0]', 'city', 'postcode', 'telephone'].forEach(name => {
                const inp = document.querySelector(`input[name="${name}"]`) as HTMLElement | null;
                if (inp) {
                  let node: HTMLElement | null = inp;
                  while (node && node.tagName !== 'BODY') {
                    if (node.style.display === 'none') node.style.display = 'block';
                    if (node.style.visibility === 'hidden') node.style.visibility = '';
                    node = node.parentElement;
                  }
                }
              });
            }).catch(() => {});

            // Fill address fields (use generic input selectors since Magento generates random IDs)
            await page.fill('input[name="firstname"]', credentials.firstName);
            await page.fill('input[name="lastname"]', credentials.lastName);
            await page.fill('input[name="street[0]"]', credentials.address);
            await page.fill('input[name="city"]', credentials.city);

            // Select state
            const stateSelect = await page.$('select[name="region_id"]');
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

            await page.fill('input[name="postcode"]', credentials.postcode);
            await page.fill('input[name="telephone"]', credentials.phone);
            await page.waitForTimeout(1000);
          } else {
            // PrestaShop guest checkout
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

            await page.waitForSelector('input[name="address1"]', { timeout: 10000 });
            await page.fill('input[name="address1"]', credentials.address);
            await page.fill('input[name="city"]', credentials.city);
            await page.fill('input[name="postcode"]', credentials.postcode);

            const stateSelect = await page.$('select[name="id_state"]');
            if (stateSelect) {
              await stateSelect.selectOption({ label: credentials.state }).catch(async () => {
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

            await page.click('button[name="confirm-addresses"]');
            await page.waitForTimeout(3000);
          }
        },
      },
      {
        name: 'Select shipping method',
        goal: 'Select the first available shipping method radio button, then click the Next button to proceed to the payment step.',
        execute: async (page: Page) => {
          if (isMagento) {
            // Wait for shipping methods to load
            await page.waitForSelector('input[type="radio"][name^="ko_unique"], input[name="shipping_method"]', { timeout: 15000 }).catch(() => {});
            // Select first radio
            const radio = await page.$('input[type="radio"][name^="ko_unique"]:not(:checked), input[name="shipping_method"]:not(:checked)');
            if (radio) await radio.check().catch(() => {});
            await page.waitForTimeout(1000);
            // Click "Next"
            const nextBtn = await page.$('button.continue, button[data-role="opc-continue"]');
            if (nextBtn) {
              await nextBtn.click();
              // Wait for payment step to load
              await page.waitForSelector('#checkout-payment-method-load, .payment-methods', { timeout: 20000 }).catch(() => {});
              await page.waitForTimeout(2000);
            }
          } else {
            await page.waitForSelector('button[name="confirmDeliveryOption"]', { timeout: 10000 });
            await page.click('button[name="confirmDeliveryOption"]');
            await page.waitForTimeout(3000);
          }
        },
      },
      {
        name: 'Complete payment and place order',
        goal: "Select the 'Check / Money order' payment method if available, then click the Place Order button.",
        execute: async (page: Page) => {
          if (isMagento) {
            // Wait for payment methods to be visible
            await page.waitForSelector('.payment-method', { timeout: 20000 }).catch(() => {});

            // Select "Check / Money order"
            const checkmo = await page.$('#checkmo, input[value="checkmo"]');
            if (checkmo) await checkmo.click().catch(() => {});
            await page.waitForTimeout(1000);

            // Click "Place Order"
            const placeOrderBtn = await page.$('button.action.primary.checkout, button.checkout[title="Place Order"]');
            if (!placeOrderBtn) throw new Error('Place Order button not found');
            await placeOrderBtn.click();
            // Wait for redirect to success page
            await page.waitForURL('**/checkout/onepage/success/**', { timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(3000);
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
        goal: "Verify that the order confirmation page is displayed, showing a 'Thank you' message or order success indicator.",
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
