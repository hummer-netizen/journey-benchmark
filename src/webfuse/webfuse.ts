import type { Page } from 'playwright';
import type { AutomationProvider } from './provider.js';

/** Stub provider for the Webfuse Automation API — wired in Sprint 2 */
export class WebfuseProvider implements AutomationProvider {
  constructor() {
    const apiKey = process.env['WEBFUSE_API_KEY'];
    if (!apiKey) {
      throw new Error('Not configured — set WEBFUSE_API_KEY');
    }
  }

  async openUrl(_url: string): Promise<Page> {
    throw new Error('Not configured — set WEBFUSE_API_KEY');
  }

  async close(): Promise<void> {
    // no-op
  }
}
