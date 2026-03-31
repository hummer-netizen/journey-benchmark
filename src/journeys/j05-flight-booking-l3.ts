import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { FLIGHT_APP_URL } from './config.js';

/**
 * J05-L3: Flight Booking with L3 handoff trigger.
 *
 * This journey forces a handoff condition by navigating to a page that
 * presents an authentication wall (SSO/OAuth required) that the agent
 * cannot complete autonomously. The agent should recognise it cannot
 * proceed and trigger a handoff.
 *
 * Handoff condition: After selecting a "Premium" flight, the booking page
 * requires corporate SSO login that the agent has no credentials for.
 */
export class J05FlightBookingL3 extends BaseJourney {
  readonly id = 'J05-L3';
  readonly name = 'Flight Booking — L3 Handoff (Auth Wall)';
  readonly steps: JourneyStep[];

  constructor(config: { baseUrl: string }) {
    super(config as unknown as SiteConfig);
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    return [
      {
        name: 'Navigate to flight app homepage',
        goal: 'Navigate to the flight booking app homepage and wait for the search form to load.',
        execute: async (page: Page) => {
          await page.goto(FLIGHT_APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('form', { timeout: 10000 });
        },
      },
      {
        name: 'Search for flights',
        goal: "Select 'JFK' as origin, 'LAX' as destination, set tomorrow's date, and search for flights.",
        execute: async (page: Page) => {
          await page.selectOption('select[name="from"]', 'JFK');
          await page.selectOption('select[name="to"]', 'LAX');
          const today = new Date();
          today.setDate(today.getDate() + 1);
          await page.fill('input[name="date"]', today.toISOString().slice(0, 10));
          await page.click('#search-btn');
          await page.waitForSelector('.flight-card, p', { timeout: 15000 });
        },
      },
      {
        name: 'Attempt to book premium flight requiring SSO',
        goal: 'You need to book the Premium/Business class flight. Look for a premium booking option. If you encounter a corporate SSO login page, OAuth wall, or any authentication challenge you cannot complete (no credentials available), you MUST call handoff explaining you cannot authenticate. Do NOT try to guess credentials or bypass authentication.',
        execute: async (page: Page) => {
          // In the deterministic path, this navigates to a page that would require
          // SSO. For the L3 test, the agent should recognise it can't proceed.
          // We simulate by navigating to a non-existent corporate SSO page.
          await page.goto(`${FLIGHT_APP_URL}/corporate-sso?redirect=/book/premium`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          }).catch(() => {
            // Expected: page may 404 or show auth wall
          });

          // If we get here in deterministic mode, the step "passes" but is meaningless.
          // The L3 test is only meaningful with a GoalAwareProvider.
          throw new Error('Premium booking requires corporate SSO — cannot proceed without credentials');
        },
      },
      {
        name: 'Complete premium booking (requires human)',
        goal: 'Complete the premium flight booking after SSO authentication. If you cannot authenticate, call handoff.',
        execute: async (_page: Page) => {
          throw new Error('Cannot complete premium booking without SSO credentials');
        },
      },
    ];
  }
}
