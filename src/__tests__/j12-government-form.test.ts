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

import { J12GovernmentForm } from '../journeys/j12-government-form.js';

function makeMockPage(overrides: Partial<Page> = {}): Page {
  return {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(null),
    selectOption: vi.fn().mockResolvedValue([]),
    check: vi.fn().mockResolvedValue(null),
    $: vi.fn().mockResolvedValue(null),
    textContent: vi.fn().mockResolvedValue('Jane Doe Main Street employed GF-ABC123'),
    $$: vi.fn().mockResolvedValue([]),
    url: vi.fn().mockReturnValue('http://localhost:3335/apply/confirmation/GF-ABC123'),
    ...overrides,
  } as unknown as Page;
}

describe('J12GovernmentForm', () => {
  let journey: J12GovernmentForm;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = new J12GovernmentForm({ baseUrl: 'http://localhost:3335' });
  });

  it('has correct id and name', () => {
    expect(journey.id).toBe('J12');
    expect(journey.name).toBe('Government Long Form (4-page)');
  });

  it('has 12 steps', () => {
    expect(journey.steps).toHaveLength(12);
  });

  it('step 0 navigates to gov-forms homepage', async () => {
    const page = makeMockPage();
    await journey.steps[0]!.execute(page);
    expect(page.goto).toHaveBeenCalledWith('http://localhost:3335', expect.any(Object));
  });

  it('step 2 fills personal information', async () => {
    const page = makeMockPage();
    await journey.steps[2]!.execute(page);
    expect(page.fill).toHaveBeenCalledWith('#first_name', 'Jane');
    expect(page.fill).toHaveBeenCalledWith('#last_name', 'Doe');
    expect(page.fill).toHaveBeenCalledWith('#email', 'jane.doe@example.com');
    expect(page.selectOption).toHaveBeenCalledWith('#nationality', 'domestic');
  });

  it('step 4 fills address with state dropdown', async () => {
    const page = makeMockPage();
    await journey.steps[4]!.execute(page);
    expect(page.fill).toHaveBeenCalledWith('#street', '123 Main Street');
    expect(page.selectOption).toHaveBeenCalledWith('#state', 'California');
    expect(page.selectOption).toHaveBeenCalledWith('#country', 'US');
  });

  it('step 6 selects employment status (conditional)', async () => {
    const page = makeMockPage();
    await journey.steps[6]!.execute(page);
    expect(page.selectOption).toHaveBeenCalledWith('#employment_status', 'employed');
    expect(page.fill).toHaveBeenCalledWith('#occupation', 'Software Engineer');
  });

  it('step 10 checks declaration and submits', async () => {
    const page = makeMockPage();
    await journey.steps[10]!.execute(page);
    expect(page.check).toHaveBeenCalledWith('#declaration');
    expect(page.click).toHaveBeenCalledWith('#submit-btn');
  });

  it('step 11 verifies reference number starts with GF-', async () => {
    const page = makeMockPage({
      textContent: vi.fn().mockResolvedValue('GF-ABC123-XY'),
    });
    await journey.steps[11]!.execute(page);
    expect(page.textContent).toHaveBeenCalledWith('#reference-number');
  });

  it('step 11 throws if reference number is invalid', async () => {
    const page = makeMockPage({
      textContent: vi.fn().mockResolvedValue('INVALID-REF'),
    });
    await expect(journey.steps[11]!.execute(page)).rejects.toThrow('Invalid reference number');
  });
});
