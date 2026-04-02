import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';

vi.mock('../journeys/config.js', () => ({
  FLIGHT_APP_URL: 'http://localhost:3333',
  AUTH_APP_URL: 'http://localhost:3334',
  GOV_FORMS_URL: 'http://localhost:3335',
  RETURN_PORTAL_URL: 'http://localhost:3336',
  FLIGHT_APP_CONFIG: { baseUrl: 'http://localhost:3333' },
  AUTH_APP_CONFIG: { baseUrl: 'http://localhost:3334' },
  GOV_FORMS_CONFIG: { baseUrl: 'http://localhost:3335' },
  RETURN_PORTAL_CONFIG: { baseUrl: 'http://localhost:3336' },
  getSiteConfig: () => ({ baseUrl: 'http://localhost:7770', selectors: {}, credentials: {} }),
  MAGENTO_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
  PRESTASHOP_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
}));

import { J17ReturnRefund } from '../journeys/j17-return-refund.js';

function makeMockPage(overrides: Partial<Page> = {}): Page {
  const mockElement = { click: vi.fn().mockResolvedValue(null) };
  return {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(null),
    selectOption: vi.fn().mockResolvedValue([]),
    $: vi.fn().mockResolvedValue(mockElement),
    $$: vi.fn().mockResolvedValue([mockElement, mockElement]),
    textContent: vi.fn().mockResolvedValue('RTN-ORD-10021-ABCDEF CONF-12345678'),
    url: vi.fn().mockReturnValue('http://localhost:3336/orders/ORD-10021/return/done/CONF-12345678'),
    ...overrides,
  } as unknown as Page;
}

describe('J17ReturnRefund', () => {
  let journey: J17ReturnRefund;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = new J17ReturnRefund({ baseUrl: 'http://localhost:3336' });
  });

  it('has correct id and name', () => {
    expect(journey.id).toBe('J17');
    expect(journey.name).toBe('Return/Refund Request');
  });

  it('has 9 steps', () => {
    expect(journey.steps).toHaveLength(9);
  });

  it('step 0 navigates to return portal', async () => {
    const page = makeMockPage();
    await journey.steps[0]!.execute(page);
    expect(page.goto).toHaveBeenCalledWith('http://localhost:3336', expect.any(Object));
  });

  it('step 1 fills login form', async () => {
    const page = makeMockPage();
    await journey.steps[1]!.execute(page);
    expect(page.fill).toHaveBeenCalledWith('#email', 'alice@example.com');
    expect(page.fill).toHaveBeenCalledWith('#password', 'password123');
    expect(page.click).toHaveBeenCalledWith('#login-btn');
  });

  it('step 2 verifies order cards exist', async () => {
    const page = makeMockPage();
    await journey.steps[2]!.execute(page);
    expect(page.$$).toHaveBeenCalledWith('.order-card');
  });

  it('step 2 throws if no order cards found', async () => {
    const page = makeMockPage({ $$: vi.fn().mockResolvedValue([]) });
    await expect(journey.steps[2]!.execute(page)).rejects.toThrow('No order cards found');
  });

  it('step 4 fills return reason and refund method', async () => {
    const page = makeMockPage();
    await journey.steps[4]!.execute(page);
    expect(page.selectOption).toHaveBeenCalledWith('#return_reason', 'defective');
    expect(page.selectOption).toHaveBeenCalledWith('#return_method', 'original');
  });

  it('step 6 verifies return label contains RTN-', async () => {
    const page = makeMockPage({
      textContent: vi.fn().mockResolvedValue('RTN-ORD-10021-ABCDEF'),
    });
    await journey.steps[6]!.execute(page);
    expect(page.textContent).toHaveBeenCalledWith('#return-label');
  });

  it('step 8 verifies confirmation number starts with CONF-', async () => {
    const page = makeMockPage({
      textContent: vi.fn().mockResolvedValue('CONF-ABCDEF12'),
    });
    await journey.steps[8]!.execute(page);
    expect(page.textContent).toHaveBeenCalledWith('#confirmation-number');
  });

  it('step 8 throws if confirmation number is invalid', async () => {
    const page = makeMockPage({
      textContent: vi.fn().mockResolvedValue('INVALID'),
    });
    await expect(journey.steps[8]!.execute(page)).rejects.toThrow('Invalid confirmation number');
  });
});
