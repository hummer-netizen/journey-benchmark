import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright';

vi.mock('../journeys/config.js', () => ({
  GYM_URL: 'http://localhost:3337',
  GYM_CONFIG: { baseUrl: 'http://localhost:3337' },
  getSiteConfig: () => ({ baseUrl: 'http://localhost:3337', selectors: {}, credentials: {} }),
  MAGENTO_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
  PRESTASHOP_CONFIG: { baseUrl: 'http://localhost:8080', selectors: {}, credentials: {} },
  FLIGHT_APP_URL: 'http://localhost:3333',
  AUTH_APP_URL: 'http://localhost:3334',
  FLIGHT_APP_CONFIG: { baseUrl: 'http://localhost:3333' },
  AUTH_APP_CONFIG: { baseUrl: 'http://localhost:3334' },
  GOV_FORMS_CONFIG: { baseUrl: 'http://localhost:3335' },
  RETURN_PORTAL_CONFIG: { baseUrl: 'http://localhost:3336' },
  resolveAppUrls: vi.fn(),
  resolveGymUrl: vi.fn(),
}));

import { J00TheGym } from '../journeys/j00-the-gym.js';
import { MetricCollector } from '../metrics/collector.js';

function makeMockPage(overrides: Partial<Page> = {}): Page {
  return {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(null),
    dispatchEvent: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(null),
    selectOption: vi.fn().mockResolvedValue(null),
    textContent: vi.fn().mockImplementation((selector: string) => {
      const map: Record<string, string> = {
        '#date-status': 'Date selected: 2026-06-15',
        '#select-status': 'Exercise selected: deadlift',
        '#context-status': 'Context action: edit',
        '#image-status': 'Image selected: Blue equipment',
        '#textarea-status': 'Notes: 35 chars',
        '#result-summary': JSON.stringify({
          date: '2026-06-15',
          exercise: 'deadlift',
          contextAction: 'edit',
          selectedImage: 'img-blue',
          notes: '3x5 deadlifts at 100kg, felt strong',
        }),
      };
      return Promise.resolve(map[selector] ?? null);
    }),
    $eval: vi.fn().mockImplementation((_sel: string, _fn: Function) => {
      return Promise.resolve(true); // .selected class check
    }),
    ...overrides,
  } as unknown as Page;
}

describe('J00TheGym', () => {
  let journey: J00TheGym;

  beforeEach(() => {
    journey = new J00TheGym({ baseUrl: 'http://localhost:3337' });
  });

  it('has correct id and name', () => {
    expect(journey.id).toBe('J00');
    expect(journey.name).toBe('The Gym — Component Diagnostic');
  });

  it('has 7 steps covering all components + submit', () => {
    expect(journey.steps).toHaveLength(7);
    expect(journey.steps[0]!.name).toBe('Navigate to The Gym');
    expect(journey.steps[1]!.name).toContain('DatePicker');
    expect(journey.steps[2]!.name).toContain('Select');
    expect(journey.steps[3]!.name).toContain('ContextMenu');
    expect(journey.steps[4]!.name).toContain('ClickableImage');
    expect(journey.steps[5]!.name).toContain('Textarea');
    expect(journey.steps[6]!.name).toContain('Submit');
  });

  it('all steps have goal strings for Track C', () => {
    for (const step of journey.steps) {
      expect(step.goal).toBeTruthy();
      expect(typeof step.goal).toBe('string');
    }
  });

  it('executes all steps successfully with mocked page', async () => {
    const page = makeMockPage();
    const collector = new MetricCollector();
    const result = await journey.execute(page, collector);

    expect(result.journeyId).toBe('J00');
    expect(result.status).toBe('passed');
    expect(result.stepsCompleted).toBe(7);
    expect(result.stepsTotal).toBe(7);
    expect(result.partialCompletion).toBe(1);
  });

  it('fails gracefully when date status is wrong', async () => {
    const page = makeMockPage({
      textContent: vi.fn().mockImplementation((sel: string) => {
        if (sel === '#date-status') return Promise.resolve('Date selected: wrong-date');
        return Promise.resolve('ok');
      }),
    });
    const collector = new MetricCollector();
    const result = await journey.execute(page, collector);

    expect(result.status).toBe('failed');
    expect(result.stepsCompleted).toBeLessThan(7);
  });
});
