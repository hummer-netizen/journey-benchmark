import { chromium, type Browser, type Page } from 'playwright';
import type { AutomationProvider } from './provider.js';

/** Direct Playwright provider — launches a real browser locally */
export class DirectProvider implements AutomationProvider {
  private browser: Browser | null = null;
  private headless: boolean;

  constructor(headless = true) {
    this.headless = headless;
  }

  async openUrl(url: string): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }
    const context = await this.browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
