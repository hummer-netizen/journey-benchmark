import type { SiteConfig } from '../types.js';

/** Default config for a Magento-style store */
export const MAGENTO_CONFIG: SiteConfig = {
  baseUrl: process.env['SHOP_URL'] ?? 'http://localhost:8080',
  selectors: {
    searchInput: '#search',
    searchButton: 'button[type="submit"].action.search',
    productLink: 'ol.products .product-item-link',
    addToCartButton: '#product-addtocart-button',
    cartIcon: 'a.action.showcart',
    cartCount: 'span.counter-number',
    checkoutButton: 'button[data-role="proceed-to-checkout"]',
    firstNameInput: '#firstname',
    lastNameInput: '#lastname',
    addressInput: 'input[name="street[0]"]',
    cityInput: 'input[name="city"]',
    stateInput: 'select[name="region_id"]',
    postcodeInput: 'input[name="postcode"]',
    phoneInput: 'input[name="telephone"]',
    placeOrderButton: 'button.action.primary.checkout',
    orderConfirmation: '.checkout-success',
    productTitle: 'h1.page-title .base',
    productPrice: '.price-box .price',
  },
  credentials: {
    email: process.env['SHOP_EMAIL'] ?? 'test@example.com',
    password: process.env['SHOP_PASSWORD'] ?? 'test123',
    firstName: 'Test',
    lastName: 'User',
    address: '123 Main St',
    city: 'Anytown',
    state: 'California',
    postcode: '90210',
    phone: '5555555555',
  },
};

/** Config for PrestaShop with Hummingbird theme (default Docker image) */
export const PRESTASHOP_CONFIG: SiteConfig = {
  baseUrl: process.env['SHOP_URL'] ?? 'http://localhost:8080',
  selectors: {
    searchInput: 'input.js-search-input',
    searchButton: '', // Hummingbird uses form submit, not a search button
    productLink: 'a.product-miniature__title',
    addToCartButton: '.product__add-to-cart-button',
    cartIcon: 'a[href$="/cart"], .blockcart a',
    cartCount: '.cart-products-count',
    checkoutButton: '.cart-summary__actions.checkout a, .cart-summary__actions button:not([disabled])',
    firstNameInput: 'input[name="firstname"]',
    lastNameInput: 'input[name="lastname"]',
    addressInput: 'input[name="address1"]',
    cityInput: 'input[name="city"]',
    stateInput: 'select[name="id_state"]',
    postcodeInput: 'input[name="postcode"]',
    phoneInput: 'input[name="phone"]',
    placeOrderButton: '#payment-confirmation button',
    orderConfirmation: '#order-confirmation, .order-confirmation',
    productTitle: 'h1.product__name',
    productPrice: '.product__price, .product__current-price',
  },
  credentials: {
    email: process.env['SHOP_EMAIL'] ?? 'test@example.com',
    password: process.env['SHOP_PASSWORD'] ?? 'test123',
    firstName: 'Test',
    lastName: 'User',
    address: '123 Main St',
    city: 'Anytown',
    state: 'Florida',
    postcode: '33101',
    phone: '5555555555',
  },
};

/** Config for WebArena OneStopShop (Magento 2, pre-seeded with WebArena data) */
export const WEBARENA_CONFIG: SiteConfig = {
  baseUrl: process.env['SHOP_URL'] ?? 'http://localhost:7770',
  selectors: {
    // Magento 2 selectors (same as MAGENTO_CONFIG — WebArena uses Magento 2)
    searchInput: '#search',
    searchButton: 'button[type="submit"].action.search',
    productLink: 'ol.products .product-item-link',
    addToCartButton: '#product-addtocart-button',
    cartIcon: 'a.action.showcart',
    cartCount: 'span.counter-number',
    checkoutButton: 'button[data-role="proceed-to-checkout"]',
    firstNameInput: '#firstname',
    lastNameInput: '#lastname',
    addressInput: 'input[name="street[0]"]',
    cityInput: 'input[name="city"]',
    stateInput: 'select[name="region_id"]',
    postcodeInput: 'input[name="postcode"]',
    phoneInput: 'input[name="telephone"]',
    placeOrderButton: 'button.action.primary.checkout',
    orderConfirmation: '.checkout-success',
    productTitle: 'h1.page-title .base',
    productPrice: '.price-box .price',
  },
  credentials: {
    email: process.env['SHOP_EMAIL'] ?? 'admin@example.com',
    password: process.env['SHOP_PASSWORD'] ?? 'admin1234!',
    firstName: 'Test',
    lastName: 'User',
    address: '6146 Honey Bluff Parkway',
    city: 'Calder',
    state: 'Michigan',
    postcode: '49628-7978',
    phone: '5555555555',
  },
};

/** Determine which config to use based on SITE_TYPE env var (evaluated at call time) */
export function getSiteConfig(): SiteConfig {
  const siteType = process.env['SITE_TYPE'] ?? 'webarena';
  const shopUrl = process.env['SHOP_URL'];

  if (siteType === 'prestashop') {
    return { ...PRESTASHOP_CONFIG, baseUrl: shopUrl ?? PRESTASHOP_CONFIG.baseUrl };
  }
  if (siteType === 'magento') {
    return { ...MAGENTO_CONFIG, baseUrl: shopUrl ?? MAGENTO_CONFIG.baseUrl };
  }
  // webarena
  return { ...WEBARENA_CONFIG, baseUrl: shopUrl ?? WEBARENA_CONFIG.baseUrl };
}

/**
 * Public tunnel URLs for Webfuse provider (Surfly proxy can't reach localhost).
 * Maps: envVar -> [localDefault, publicDefault]
 */
const APP_URLS: Record<string, [string, string]> = {
  FLIGHT_APP_URL:    ['http://localhost:3333', 'https://flight-app.webfuse.it'],
  AUTH_APP_URL:      ['http://localhost:3334', 'https://auth-app.webfuse.it'],
  GOV_FORMS_URL:     ['http://localhost:3335', 'https://gov-forms.webfuse.it'],
  RETURN_PORTAL_URL: ['http://localhost:3336', 'https://return-portal.webfuse.it'],
};

function resolveAppUrl(envVar: string): string {
  if (process.env[envVar]) return process.env[envVar]!;
  const [local, pub] = APP_URLS[envVar]!;
  const provider = process.env['AUTOMATION_PROVIDER'] ?? 'direct';
  return (provider === 'webfuse' || provider === 'webfuse-mcp') ? pub : local;
}

// Exported as `let` so ESM live bindings work after resolveAppUrls() is called.
export let FLIGHT_APP_URL = resolveAppUrl('FLIGHT_APP_URL');
export let AUTH_APP_URL = resolveAppUrl('AUTH_APP_URL');
export let GOV_FORMS_URL = resolveAppUrl('GOV_FORMS_URL');
export let RETURN_PORTAL_URL = resolveAppUrl('RETURN_PORTAL_URL');

/**
 * Re-resolve all app URLs. Call this from the CLI action handler AFTER setting
 * process.env['AUTOMATION_PROVIDER'] so that webfuse runs get public tunnel URLs.
 */
export function resolveAppUrls(): void {
  FLIGHT_APP_URL = resolveAppUrl('FLIGHT_APP_URL');
  AUTH_APP_URL = resolveAppUrl('AUTH_APP_URL');
  GOV_FORMS_URL = resolveAppUrl('GOV_FORMS_URL');
  RETURN_PORTAL_URL = resolveAppUrl('RETURN_PORTAL_URL');
}

export const FLIGHT_APP_CONFIG = { get baseUrl() { return FLIGHT_APP_URL; } };
export const AUTH_APP_CONFIG = { get baseUrl() { return AUTH_APP_URL; } };
export const GOV_FORMS_CONFIG = { get baseUrl() { return GOV_FORMS_URL; } };
export const RETURN_PORTAL_CONFIG = { get baseUrl() { return RETURN_PORTAL_URL; } };
