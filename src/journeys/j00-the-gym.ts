import type { Page } from 'playwright';
import type { JourneyStep } from '../types.js';
import { BaseJourney } from './base.js';

/**
 * Journey 0 — "The Gym"
 *
 * A synthetic diagnostic page with isolated core web components.
 * Each step exercises exactly one component so Track C reports can
 * attribute pass/fail per component type.
 *
 * The page is served from journeys/journey-0/index.html (file:// or http).
 */
export class J00TheGym extends BaseJourney {
  id = 'J00';
  name = 'The Gym — Component Diagnostic';
  steps: JourneyStep[];

  private pageUrl: string;

  constructor(config: { baseUrl: string }) {
    // J00 doesn't use SiteConfig selectors — pass a minimal object
    super({
      baseUrl: config.baseUrl,
      selectors: {} as any,
      credentials: {} as any,
    });
    this.pageUrl = config.baseUrl;
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    const url = this.pageUrl;

    return [
      {
        name: 'Navigate to The Gym',
        goal: 'Navigate to the Journey 0 page and wait for the page title "Journey 0 — The Gym" to appear.',
        execute: async (page: Page) => {
          // Cache-bust to ensure co-browsing sessions get the latest version
          const cbUrl = url.includes('?') ? `${url}&cb=${Date.now()}` : `${url}?cb=${Date.now()}`;
          await page.goto(cbUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForSelector('h1', { timeout: 10000 });
        },
      },
      {
        name: 'DatePicker — Select a date',
        goal: 'Find the date input labelled "Select a date" and set it to 2026-06-15. Verify the status message shows the selected date.',
        execute: async (page: Page) => {
          await page.fill('#gym-date', '2026-06-15');
          await page.dispatchEvent('#gym-date', 'change');
          await page.waitForSelector('#date-status.success', { timeout: 10000 });
          const text = await page.textContent('#date-status');
          if (!text?.includes('2026-06-15')) {
            throw new Error(`DatePicker: expected status to contain '2026-06-15', got '${text}'`);
          }
        },
      },
      {
        name: 'Select — Choose an exercise',
        goal: 'Open the "Choose an exercise" dropdown and select "Deadlift". Verify the status message confirms the selection.',
        execute: async (page: Page) => {
          await page.selectOption('#gym-exercise', 'deadlift');
          await page.waitForSelector('#select-status.success', { timeout: 10000 });
          const text = await page.textContent('#select-status');
          if (!text?.includes('deadlift')) {
            throw new Error(`Select: expected status to contain 'deadlift', got '${text}'`);
          }
        },
      },
      {
        name: 'ContextMenu — Right-click and choose action',
        goal: 'Right-click on the grey area labelled "Right-click here" to open the context menu, then click the "Edit" option. Verify the status message shows "Context action: edit".',
        execute: async (page: Page) => {
          await page.click('#gym-context-area', { button: 'right' });
          await page.waitForSelector('#gym-context-menu.visible', { timeout: 10000 });
          await page.click('#ctx-edit');
          await page.waitForSelector('#context-status.success', { timeout: 10000 });
          const text = await page.textContent('#context-status');
          if (!text?.includes('edit')) {
            throw new Error(`ContextMenu: expected status to contain 'edit', got '${text}'`);
          }
        },
      },
      {
        name: 'ClickableImage — Select an image',
        goal: 'Click the blue image (labelled "Blue equipment") to select it. Verify the status message confirms "Blue equipment" was selected and the image has a green border.',
        execute: async (page: Page) => {
          await page.click('#img-blue');
          await page.waitForSelector('#image-status.success', { timeout: 10000 });
          const text = await page.textContent('#image-status');
          if (!text?.includes('Blue')) {
            throw new Error(`ClickableImage: expected status to contain 'Blue', got '${text}'`);
          }
          const isSelected = await page.$eval('#img-blue', el => el.classList.contains('selected'));
          if (!isSelected) {
            throw new Error('ClickableImage: #img-blue does not have .selected class');
          }
        },
      },
      {
        name: 'Textarea — Enter workout notes',
        goal: 'Click on the workout notes textarea and type "3x5 deadlifts at 100kg, felt strong". Verify the status message shows the character count.',
        execute: async (page: Page) => {
          await page.fill('#gym-notes', '3x5 deadlifts at 100kg, felt strong');
          await page.dispatchEvent('#gym-notes', 'input');
          await page.waitForSelector('#textarea-status.success', { timeout: 10000 });
          const text = await page.textContent('#textarea-status');
          if (!text?.includes('chars')) {
            throw new Error(`Textarea: expected status to contain 'chars', got '${text}'`);
          }
        },
      },
      {
        name: 'Submit — Verify all components',
        goal: 'Click the "Submit All" button. Verify the submission summary panel appears showing all the values you entered (date, exercise, image, notes).',
        execute: async (page: Page) => {
          await page.click('#gym-submit');
          await page.waitForSelector('#result-panel.visible', { timeout: 10000 });
          const summary = await page.textContent('#result-summary');
          if (!summary) {
            throw new Error('Submit: result summary is empty');
          }
          // Verify all fields are present in the JSON summary
          const parsed = JSON.parse(summary);
          if (parsed.date === '(not set)') throw new Error('Submit: date not recorded');
          if (parsed.exercise === '(not set)') throw new Error('Submit: exercise not recorded');
          if (parsed.selectedImage === '(none)') throw new Error('Submit: image not recorded');
          if (parsed.notes === '(empty)') throw new Error('Submit: notes not recorded');
        },
      },
    ];
  }
}
