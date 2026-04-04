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
        name: 'HoverState — Reveal and click',
        goal: 'Hover over the grey box that says "Hover over me" to reveal a hidden message and a button. Then click the "Claim Reward" button. Verify the status message shows "Reward claimed!".',
        execute: async (page: Page) => {
          await page.hover('#gym-hover-area');
          await page.waitForSelector('#hover-reveal', { state: 'visible', timeout: 10000 });
          await page.click('#hover-action-btn');
          await page.waitForSelector('#hover-status.success', { timeout: 10000 });
          const text = await page.textContent('#hover-status');
          if (!text?.includes('claimed')) {
            throw new Error(`HoverState: expected status to contain "claimed", got "${text}"`);
          }
        },
      },
      {
        name: 'ShadowDOM — Enter membership ID',
        goal: 'Find the Shadow DOM component with a dashed border. Inside it there is an input labelled "Membership ID" and a "Verify" button. Type "GYM-1234" into the input and click "Verify". Verify the status message below the component shows "Membership verified: GYM-1234".',
        execute: async (page: Page) => {
          const shadowInput = await page.evaluateHandle(() => {
            const host = document.querySelector('#gym-shadow-host');
            return host?.shadowRoot?.querySelector('#shadow-member-id');
          });
          await (shadowInput as any).fill('GYM-1234');
          const shadowBtn = await page.evaluateHandle(() => {
            const host = document.querySelector('#gym-shadow-host');
            return host?.shadowRoot?.querySelector('#shadow-verify-btn');
          });
          await (shadowBtn as any).click();
          await page.waitForSelector('#shadow-status.success', { timeout: 10000 });
          const text = await page.textContent('#shadow-status');
          if (!text?.includes('GYM-1234')) {
            throw new Error(`ShadowDOM: expected status to contain "GYM-1234", got "${text}"`);
          }
        },
      },
      {
        name: 'NativeDate — Select a date with type=date',
        goal: 'Find the native HTML5 date input labelled "Select workout date" (it has type="date"). Set it to 2026-07-20. Verify the status message shows the selected date.',
        execute: async (page: Page) => {
          await page.fill('#gym-native-date', '2026-07-20');
          await page.dispatchEvent('#gym-native-date', 'change');
          await page.waitForSelector('#native-date-status.success', { timeout: 10000 });
          const text = await page.textContent('#native-date-status');
          if (!text?.includes('2026-07-20')) {
            throw new Error(`NativeDate: expected status to contain "2026-07-20", got "${text}"`);
          }
        },
      },
      {
        name: 'TimeInput — Select a time',
        goal: 'Find the time input labelled "Select a time" and set it to 13:45. Verify the status message shows "Time selected: 13:45".',
        execute: async (page: Page) => {
          await page.fill('#gym-time', '13:45');
          await page.dispatchEvent('#gym-time', 'change');
          await page.waitForSelector('#time-status.success', { timeout: 10000 });
          const text = await page.textContent('#time-status');
          if (!text?.includes('13:45')) {
            throw new Error(`TimeInput: expected status to contain '13:45', got '${text}'`);
          }
        },
      },
      {
        name: 'DateTimeLocal — Select date and time',
        goal: 'Find the datetime-local input labelled "Select date and time" and set it to 2026-07-20T13:45. Verify the status message shows "DateTime selected:" followed by the value.',
        execute: async (page: Page) => {
          await page.fill('#gym-datetime', '2026-07-20T13:45');
          await page.dispatchEvent('#gym-datetime', 'change');
          await page.waitForSelector('#datetime-status.success', { timeout: 10000 });
          const text = await page.textContent('#datetime-status');
          if (!text?.includes('2026-07-20T13:45')) {
            throw new Error(`DateTimeLocal: expected status to contain '2026-07-20T13:45', got '${text}'`);
          }
        },
      },
      {
        name: 'RangeSlider — Set intensity to 75',
        goal: 'Find the range slider labelled "Set intensity (0-100)" and set it to 75. Verify the displayed value shows "75" and the status message shows "Intensity set to 75!".',
        execute: async (page: Page) => {
          await page.fill('#gym-range', '75');
          await page.dispatchEvent('#gym-range', 'input');
          await page.waitForSelector('#range-status.success', { timeout: 10000 });
          const text = await page.textContent('#range-status');
          if (!text?.includes('75')) {
            throw new Error(`RangeSlider: expected status to contain '75', got '${text}'`);
          }
          const displayed = await page.textContent('#range-value');
          if (displayed?.trim() !== '75') {
            throw new Error(`RangeSlider: expected displayed value '75', got '${displayed}'`);
          }
        },
      },
      {
        name: 'NestedShadow — Type code and confirm',
        goal: 'Find the nested shadow DOM component with a blue border containing a yellow-dashed inner box. Inside the inner shadow root, type "DEEP-42" into the input and click "Confirm". Verify the status message shows "Nested confirmed: DEEP-42".',
        execute: async (page: Page) => {
          // Pierce two levels of shadow DOM using evaluateHandle
          const nestedInput = await page.evaluateHandle(() => {
            const outer = document.querySelector('#gym-nested-shadow-outer');
            const outerSR = outer?.shadowRoot;
            const inner = outerSR?.querySelector('#inner-host');
            const innerSR = inner?.shadowRoot;
            return innerSR?.querySelector('#nested-input');
          });
          await (nestedInput as any).fill('DEEP-42');
          const nestedBtn = await page.evaluateHandle(() => {
            const outer = document.querySelector('#gym-nested-shadow-outer');
            const outerSR = outer?.shadowRoot;
            const inner = outerSR?.querySelector('#inner-host');
            const innerSR = inner?.shadowRoot;
            return innerSR?.querySelector('#nested-confirm-btn');
          });
          await (nestedBtn as any).click();
          await page.waitForSelector('#nested-shadow-status.success', { timeout: 10000 });
          const text = await page.textContent('#nested-shadow-status');
          if (!text?.includes('DEEP-42')) {
            throw new Error(`NestedShadow: expected status to contain "DEEP-42", got "${text}"`);
          }
        },
      },
      {
        name: 'ClosedShadow — Enter secret code',
        goal: 'Find the closed shadow DOM component with a red border. Since the shadow root is closed, use aria labels to interact. Type "SECRET-99" into the input (aria-label "Secret code input") and click "Verify" (aria-label "Verify secret code"). Verify the status message shows "Closed verified: SECRET-99".',
        execute: async (page: Page) => {
          // Closed shadow root — use page.getByLabel() which can pierce closed shadows
          await page.getByLabel('Secret code input').fill('SECRET-99');
          await page.getByLabel('Verify secret code').click();
          await page.waitForSelector('#closed-shadow-status.success', { timeout: 10000 });
          const text = await page.textContent('#closed-shadow-status');
          if (!text?.includes('SECRET-99')) {
            throw new Error(`ClosedShadow: expected status to contain "SECRET-99", got "${text}"`);
          }
        },
      },
      {
        name: 'Dialog — Open, fill, and confirm',
        goal: 'Click the "Open Dialog" button to open a modal dialog. Inside the dialog, type "CONFIRM-OK" into the input and click "Confirm". Verify the status message shows "Dialog confirmed: CONFIRM-OK".',
        execute: async (page: Page) => {
          await page.click('#gym-open-dialog');
          await page.waitForSelector('#gym-dialog[open]', { timeout: 10000 });
          await page.fill('#dialog-input', 'CONFIRM-OK');
          await page.click('#dialog-confirm');
          await page.waitForSelector('#dialog-status.success', { timeout: 10000 });
          const text = await page.textContent('#dialog-status');
          if (!text?.includes('CONFIRM-OK')) {
            throw new Error(`Dialog: expected status to contain "CONFIRM-OK", got "${text}"`);
          }
        },
      },
      {
        name: 'Submit — Verify all components',
        goal: 'Click the "Submit All" button. Verify the submission summary panel appears showing all the values you entered (date, exercise, image, notes, hover reward, shadow membership ID, native date, time, datetime, range, nested code, closed code, dialog code).',
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
          if (parsed.hoverReward === '(not claimed)') throw new Error('Submit: hover reward not claimed');
          if (parsed.shadowMemberId === '(not set)') throw new Error('Submit: shadow member ID not recorded');
          if (parsed.nativeDate === '(not set)') throw new Error('Submit: native date not recorded');
          if (parsed.timeValue === '(not set)') throw new Error('Submit: time not recorded');
          if (parsed.datetimeValue === '(not set)') throw new Error('Submit: datetime not recorded');
          if (parsed.rangeValue !== '75') throw new Error('Submit: range not set to 75');
          if (parsed.nestedCode === '(not set)') throw new Error('Submit: nested code not recorded');
          if (parsed.closedCode === '(not set)') throw new Error('Submit: closed code not recorded');
          if (parsed.dialogCode === '(not set)') throw new Error('Submit: dialog code not recorded');
        },
      },
    ];
  }
}
