import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';

// Mock config
vi.mock('../journeys/config.js', () => ({
  FLIGHT_APP_URL: 'http://localhost:3333',
  AUTH_APP_URL: 'http://localhost:3334',
  FLIGHT_APP_CONFIG: { baseUrl: 'http://localhost:3333' },
  AUTH_APP_CONFIG: { baseUrl: 'http://localhost:3334' },
  getSiteConfig: () => ({ baseUrl: 'http://localhost:3333', selectors: {}, credentials: {} }),
  MAGENTO_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
  PRESTASHOP_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
}));

import { J05FlightBooking } from '../journeys/j05-flight-booking.js';

function makeMockPage(overrides: Partial<Page> = {}): Page {
  return {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    waitForURL: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(null),
    selectOption: vi.fn().mockResolvedValue(null),
    locator: vi.fn().mockReturnValue({
      first: vi.fn().mockReturnThis(),
      waitFor: vi.fn().mockResolvedValue(null),
      locator: vi.fn().mockReturnThis(),
      getAttribute: vi.fn().mockResolvedValue('/book/42'),
    }),
    $eval: vi.fn().mockImplementation((_sel: string, fn: (el: Element) => string) => {
      const el = { textContent: 'SKY1ABC' } as Element;
      return Promise.resolve(fn(el));
    }),
    $: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue('http://localhost:3333/confirmation/SKY1ABC'),
    textContent: vi.fn().mockResolvedValue('Booking Confirmed! passenger@test.com Economy'),
    ...overrides,
  } as unknown as Page;
}

describe('J05FlightBooking', () => {
  let journey: J05FlightBooking;

  beforeEach(() => {
    journey = new J05FlightBooking({ baseUrl: 'http://localhost:3333' });
  });

  it('has correct id and name', () => {
    expect(journey.id).toBe('J05');
    expect(journey.name).toBe('Flight Search & Booking');
  });

  it('has 8 steps', () => {
    expect(journey.steps).toHaveLength(8);
  });

  it('step names are descriptive', () => {
    const names = journey.steps.map((s) => s.name);
    expect(names[0]).toContain('homepage');
    expect(names[4]).toContain('Select a flight');
    expect(names[7]).toContain('confirmation');
  });

  it('navigate step calls page.goto with flight app URL', async () => {
    const page = makeMockPage();
    await journey.steps[0]!.execute(page);
    expect(page.goto).toHaveBeenCalledWith('http://localhost:3333', expect.any(Object));
  });

  it('fill passenger step fills name and email', async () => {
    const page = makeMockPage();
    await journey.steps[5]!.execute(page);
    expect(page.fill).toHaveBeenCalledWith('input[name="passenger_name"]', 'Test Passenger');
    expect(page.fill).toHaveBeenCalledWith('input[name="passenger_email"]', 'passenger@test.com');
  });
});
