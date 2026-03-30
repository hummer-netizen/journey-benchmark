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

// Mock fetch for MailPit API calls
global.fetch = vi.fn();

import { J08AccountRegistration } from '../journeys/j08-account-registration.js';

function makeMailPitMessage(email: string, subject: string, token: string) {
  return {
    messages: [{
      ID: 'msg-1',
      To: [{ Address: email }],
      Subject: subject,
    }],
  };
}

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

describe('J08AccountRegistration', () => {
  let journey: J08AccountRegistration;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = new J08AccountRegistration({ baseUrl: 'http://localhost:3334' });
  });

  it('has correct id and name', () => {
    expect(journey.id).toBe('J08');
    expect(journey.name).toBe('Account Registration + Email Verify');
  });

  it('has 7 steps', () => {
    expect(journey.steps).toHaveLength(7);
  });

  it('step 0 navigates to auth app homepage', async () => {
    const page = makeMockPage();
    await journey.steps[0]!.execute(page);
    expect(page.goto).toHaveBeenCalledWith('http://localhost:3334', expect.any(Object));
  });

  it('step 2 fills registration form fields', async () => {
    const page = makeMockPage();
    await journey.steps[2]!.execute(page);
    expect(page.fill).toHaveBeenCalledWith('input[name="name"]', 'Test User');
    expect(page.fill).toHaveBeenCalledWith('input[name="password"]', 'TestPass123!');
  });

  it('step 4 fetches verification email from MailPit', async () => {
    const email = (journey as unknown as { testEmail: string }).testEmail;
    const mockFetch = vi.mocked(global.fetch);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeMailPitMessage(email, 'Verify your email address', 'abc123')),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Text: `Please verify your email:\nhttp://localhost:3334/verify-email?token=abc123def456789012345678901234567890123456789012345678901234` }),
      } as Response);

    const page = makeMockPage();
    await journey.steps[4]!.execute(page);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/messages'));
  });
});
