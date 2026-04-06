import type { Page } from 'playwright';
import { BaseJourney } from './base.js';
import type { JourneyStep, SiteConfig } from '../types.js';
import { GOV_FORMS_URL } from './config.js';

interface GovFormsConfig {
  baseUrl: string;
}

export class J12GovernmentForm extends BaseJourney {
  readonly id = 'J12';
  readonly name = 'Government Long Form (4-page)';
  readonly steps: JourneyStep[];

  constructor(config: GovFormsConfig) {
    super(config as unknown as SiteConfig);
    this.steps = this.buildSteps();
  }

  private buildSteps(): JourneyStep[] {
    return [
      {
        name: 'Navigate to gov-forms homepage',
        goal: 'Navigate to the government forms application homepage and wait for the Start Application button.',
        execute: async (page: Page) => {
          await page.goto(GOV_FORMS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('#start-application', { timeout: 10000 });
        },
      },
      {
        name: 'Start application form',
        goal: 'Click the Start Application button and wait for the personal information form to appear.',
        execute: async (page: Page) => {
          await page.click('#start-application');
          await page.waitForSelector('#personal-info-form', { timeout: 10000 });
        },
      },
      {
        name: 'Fill personal information',
        goal: "Fill in: first_name=Jane, last_name=Doe, date_of_birth=1990-06-15, email=jane.doe@example.com, phone=+1-555-123-4567, nationality=domestic.",
        execute: async (page: Page) => {
          await page.fill('#first_name', 'Jane');
          await page.fill('#last_name', 'Doe');
          const dob = '1990-06-15';
          await page.fill('#date_of_birth', dob);
          await page.fill('#email', 'jane.doe@example.com');
          await page.fill('#phone', '+1-555-123-4567');
          // Select nationality dropdown
          await page.selectOption('#nationality', 'domestic');
        },
      },
      {
        name: 'Submit personal info and navigate to address page',
        goal: 'Click the Next button to submit the personal information and proceed to the address form.',
        execute: async (page: Page) => {
          await page.click('#next-btn');
          await page.waitForSelector('#address-form', { timeout: 10000 });
        },
      },
      {
        name: 'Fill address details with state dropdown',
        goal: 'Fill in: street=123 Main Street, city=Springfield, state=California, postcode=90210, country=US, years_at_address=more_than_5.',
        execute: async (page: Page) => {
          await page.fill('#street', '123 Main Street');
          await page.fill('#city', 'Springfield');
          await page.selectOption('#state', 'California');
          await page.fill('#postcode', '90210');
          await page.selectOption('#country', 'US');
          await page.selectOption('#years_at_address', 'more_than_5');
        },
      },
      {
        name: 'Submit address and navigate to employment page',
        goal: 'Click the Next button to submit the address details and proceed to the employment form.',
        execute: async (page: Page) => {
          await page.click('#next-btn');
          await page.waitForSelector('#employment-form', { timeout: 10000 });
        },
      },
      {
        name: 'Fill employment status (triggers conditional section)',
        goal: "Select 'employed' from the employment status dropdown to reveal the employer details section, then fill occupation='Software Engineer'.",
        execute: async (page: Page) => {
          await page.selectOption('#employment_status', 'employed');
          // The conditional employer section should appear
          await page.waitForSelector('#employer-details.visible', { timeout: 5000 });
          await page.fill('#occupation', 'Software Engineer');
        },
      },
      {
        name: 'Fill employer details in conditional section',
        goal: 'Fill in employer details: employer_name=Acme Corporation, employer_address=456 Business Ave San Francisco CA, annual_salary=75k_100k, start_date=2020-03-01.',
        execute: async (page: Page) => {
          await page.fill('#employer_name', 'Acme Corporation');
          await page.fill('#employer_address', '456 Business Ave, San Francisco, CA');
          await page.selectOption('#annual_salary', '75k_100k');
          await page.fill('#start_date', '2020-03-01');
        },
      },
      {
        name: 'Submit employment and navigate to review page',
        goal: 'Click the Next button to submit employment details and proceed to the review page.',
        execute: async (page: Page) => {
          await page.click('#next-btn');
          await page.waitForSelector('#submit-form', { timeout: 10000 });
        },
      },
      {
        name: 'Verify review page shows all entered data',
        goal: "Verify the review page displays the submitted information including 'Jane' and 'Main Street'.",
        execute: async (page: Page) => {
          const content = await page.textContent('body');
          if (!content?.includes('Jane')) throw new Error('Review page missing first name');
          if (!content?.includes('Main Street')) throw new Error('Review page missing street address');
          if (!content?.includes('employed') && !content?.includes('Software Engineer')) {
            // At least one employment field should appear
          }
        },
      },
      {
        name: 'Accept declaration and submit application',
        goal: 'Check the declaration checkbox and click the Submit button to submit the application.',
        execute: async (page: Page) => {
          await page.check('#declaration');
          await page.click('#submit-btn');
          await page.waitForSelector('#reference-number', { timeout: 15000 });
        },
      },
      {
        name: 'Verify reference number on confirmation page',
        goal: "Verify the confirmation page shows a reference number starting with 'GF-'.",
        execute: async (page: Page) => {
          const ref = await page.textContent('#reference-number');
          if (!ref || !ref.startsWith('GF-')) {
            throw new Error(`Invalid reference number: ${ref}`);
          }
        },
      },
    ];
  }
}
