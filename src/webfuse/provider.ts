import type { Page } from 'playwright';

/** Core abstraction for browser automation providers */
export interface AutomationProvider {
  /** Open a URL and return a Playwright Page instance */
  openUrl(url: string): Promise<Page>;
  /** Clean up resources */
  close(): Promise<void>;
}
