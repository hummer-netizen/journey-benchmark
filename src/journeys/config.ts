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

/** Config for a PrestaShop store */
export const PRESTASHOP_CONFIG: SiteConfig = {
  baseUrl: process.env['SHOP_URL'] ?? 'http://localhost:8080',
  selectors: {
    searchInput: 'input#search_query_top',
    searchButton: 'button[name="submit_search"]',
    productLink: 'h3.product-title a, .product-description a',
    addToCartButton: 'button.add-to-cart',
    cartIcon: 'a.shopping-cart',
    cartCount: '.cart-products-count',
    checkoutButton: 'a.btn-primary[href*="order"]',
    firstNameInput: 'input[name="firstname"]',
    lastNameInput: 'input[name="lastname"]',
    addressInput: 'input[name="address1"]',
    cityInput: 'input[name="city"]',
    stateInput: 'select[name="id_state"]',
    postcodeInput: 'input[name="postcode"]',
    phoneInput: 'input[name="phone"]',
    placeOrderButton: 'button#payment-confirmation button',
    orderConfirmation: '#order-confirmation',
    productTitle: 'h1.h1',
    productPrice: 'span.current-price',
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

/** Determine which config to use based on SITE_TYPE env var */
export function getSiteConfig(): SiteConfig {
  const siteType = process.env['SITE_TYPE'] ?? 'magento';
  if (siteType === 'prestashop') return PRESTASHOP_CONFIG;
  return MAGENTO_CONFIG;
}
