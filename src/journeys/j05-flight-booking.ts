import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { FLIGHT_APP_URL } from './config.js';

interface FlightAppConfig {
  baseUrl: string;
}

export class J05FlightBooking extends BaseJourney {
  readonly id = 'J05';
  readonly name = 'Flight Search & Booking';
  readonly steps: JourneyStep[];

  private flightId: string = '';
  private bookingRef: string = '';

  constructor(config: FlightAppConfig) {
    // BaseJourney expects SiteConfig but we only need baseUrl for these journeys
    // We cast to satisfy the interface while only using baseUrl
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
        name: 'Select origin airport',
        goal: "Select 'JFK' as the departure airport in the origin/from dropdown.",
        execute: async (page: Page) => {
          await page.selectOption('select[name="from"]', 'JFK');
        },
      },
      {
        name: 'Select destination airport',
        goal: "Select 'LAX' as the destination airport in the destination/to dropdown.",
        execute: async (page: Page) => {
          await page.selectOption('select[name="to"]', 'LAX');
        },
      },
      {
        name: 'Select departure date and search',
        goal: "Fill in tomorrow's date in the departure date field and click the Search button to find available flights.",
        execute: async (page: Page) => {
          const today = new Date();
          today.setDate(today.getDate() + 1);
          const dateStr = today.toISOString().slice(0, 10);
          await page.fill('input[name="date"]', dateStr);
          await page.click('#search-btn');
          await page.waitForSelector('.flight-card, p', { timeout: 15000 });
        },
      },
      {
        name: 'Select a flight from results',
        goal: 'Click on the first available flight card to select it and proceed to the booking form.',
        execute: async (page: Page) => {
          const flightCard = page.locator('.flight-card').first();
          await flightCard.waitFor({ timeout: 10000 });
          const link = flightCard.locator('a.btn');
          const href = await link.getAttribute('href');
          if (!href) throw new Error('No flight select link found');
          const match = href.match(/\/book\/(\d+)/);
          if (match) this.flightId = match[1];
          // Click the link directly (works with both direct and Surfly proxy navigation)
          await link.click();
          await page.waitForTimeout(3000);
        },
      },
      {
        name: 'Fill passenger details',
        goal: "Fill in: passenger_name='Test Passenger', passenger_email='passenger@test.com', and select 'Economy' for seat class.",
        execute: async (page: Page) => {
          await page.waitForSelector('input[name="passenger_name"]', { timeout: 10000 });
          await page.fill('input[name="passenger_name"]', 'Test Passenger');
          await page.fill('input[name="passenger_email"]', 'passenger@test.com');
          await page.selectOption('select[name="seat_class"]', 'Economy');
        },
      },
      {
        name: 'Confirm booking',
        goal: 'Click the Confirm Booking button and wait for the confirmation page to load.',
        execute: async (page: Page) => {
          await page.click('#confirm-booking-btn');
          await page.waitForURL(/\/confirmation\//, { timeout: 15000 });
          const url = page.url();
          const match = url.match(/\/confirmation\/([A-Z0-9]+)/);
          if (match) this.bookingRef = match[1];
        },
      },
      {
        name: 'Verify booking confirmation',
        goal: "Verify the booking confirmation page shows a reference number starting with 'SKY' and a 'Booking Confirmed' message.",
        execute: async (page: Page) => {
          await page.waitForSelector('#booking-ref', { timeout: 10000 });
          const ref = await page.$eval('#booking-ref', (el) => el.textContent?.trim() ?? '');
          if (!ref || !ref.startsWith('SKY')) {
            throw new Error(`Invalid booking reference: ${ref}`);
          }
          const confirmText = await page.textContent('.confirmation');
          if (!confirmText?.includes('Booking Confirmed')) {
            throw new Error('Booking confirmation message not found');
          }
        },
      },
    ];
  }
}
