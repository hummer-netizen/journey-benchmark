import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';

vi.mock('../journeys/config.js', () => ({
  FLIGHT_APP_URL: 'http://localhost:3333',
  AUTH_APP_URL: 'http://localhost:3334',
  FLIGHT_APP_CONFIG: { baseUrl: 'http://localhost:3333' },
  AUTH_APP_CONFIG: { baseUrl: 'http://localhost:3334' },
  getSiteConfig: () => ({ baseUrl: 'http://localhost:3334', selectors: {}, credentials: {} }),
  MAGENTO_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
  PRESTASHOP_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
}));

global.fetch = vi.fn();

import { J09PasswordReset } from '../journeys/j09-password-reset.js';

function makeMockPage(overrides: Partial<Page> = {}): Page {
  return {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    waitForURL: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(null),
    $: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue('http://localhost:3334/login'),
    ...overrides,
  } as unknown as Page;
}

describe('J09PasswordReset', () => {
  let journey: J09PasswordReset;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = new J09PasswordReset({ baseUrl: 'http://localhost:3334' });
  });

  it('has correct id and name', () => {
    expect(journey.id).toBe('J09');
    expect(journey.name).toBe('Password Reset');
  });

  it('has 7 steps', () => {
    expect(journey.steps).toHaveLength(7);
  });

  it('step 1 navigates to forgot password page', async () => {
    // Step 0 is setup (uses fetch), skip it
    const page = makeMockPage();
    await journey.steps[1]!.execute(page);
    expect(page.goto).toHaveBeenCalledWith('http://localhost:3334/forgot-password', expect.any(Object));
  });

  it('step 5 fills new password fields', async () => {
    const page = makeMockPage({
      waitForURL: vi.fn().mockResolvedValue(null),
    });
    await journey.steps[5]!.execute(page);
    expect(page.fill).toHaveBeenCalledWith('input[name="password"]', 'NewPass456!');
    expect(page.fill).toHaveBeenCalledWith('input[name="confirm_password"]', 'NewPass456!');
  });
});
