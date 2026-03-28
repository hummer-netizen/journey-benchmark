import { chromium, type Browser, type Page } from 'playwright';
import type { AutomationProvider } from './provider.js';

/**
 * Webfuse Automation API provider.
 *
 * Flow (per implementation roadmap D3):
 * 1. Launch Chromium and navigate to the Webfuse space URL
 * 2. Webfuse redirects to a session URL (e.g. https://webfu.se/sXXX)
 * 3. Extract the session_key from the URL
 * 4. The space is pre-configured to open the target URL — Playwright is
 *    now browsing through the Webfuse proxy layer
 * 5. The session_key can be passed to the MCP endpoint for AI control
 *
 * Env vars:
 *   WEBFUSE_API_KEY  — REST API token (ck_... or Token format) for webfu.se/api/
 *   WEBFUSE_REST_KEY — Session MCP token (rk_... Bearer format)
 *   WEBFUSE_SPACE_URL — Webfuse space URL to open (e.g. https://webfu.se/+benchmark/)
 *   WEBFUSE_TARGET_URL — Target site URL the space should open (falls back to baseUrl)
 */
export class WebfuseProvider implements AutomationProvider {
  private apiKey: string;
  private spaceUrl: string;
  private browser: Browser | null = null;
  private activeSessions: Array<{ page: Page; sessionKey: string }> = [];
  private headless: boolean;

  constructor(headless = true) {
    const apiKey = process.env['WEBFUSE_API_KEY'];
    if (!apiKey) {
      throw new Error('WEBFUSE_API_KEY is not set — cannot use Webfuse provider');
    }
    this.apiKey = apiKey;
    this.spaceUrl = process.env['WEBFUSE_SPACE_URL'] ?? 'https://webfu.se/+test-autom/';
    this.headless = headless;
  }

  /**
   * Navigate to the Webfuse space, get a proxied session, and return the page.
   * The Webfuse proxy wraps the target URL — automation runs through the Webfuse layer.
   */
  async openUrl(_targetUrl: string): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();

    // Navigate to the Webfuse space — Surfly redirects to a session URL
    console.log(`  [Webfuse] Opening space: ${this.spaceUrl}`);
    await page.goto(this.spaceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the session redirect — URL changes to /sXXX pattern
    const sessionUrl = await this.waitForSessionUrl(page);
    const sessionKey = this.extractSessionKey(sessionUrl);
    console.log(`  [Webfuse] Session started: ${sessionKey} — ${sessionUrl}`);

    // Wait for the Webfuse layer to finish loading the proxied page
    await this.waitForPageReady(page);

    this.activeSessions.push({ page, sessionKey });
    return page;
  }

  /**
   * Wait for Surfly to redirect the page to a session URL (pattern: /sXXX).
   */
  private async waitForSessionUrl(page: Page): Promise<string> {
    // Surfly redirects happen quickly; wait up to 15s for session URL
    let lastUrl = page.url();
    const deadline = Date.now() + 15000;

    while (Date.now() < deadline) {
      const url = page.url();
      if (url.match(/\/s\w{10,}(\/|$)/)) {
        return url;
      }
      if (url !== lastUrl) {
        lastUrl = url;
        console.log(`  [Webfuse] URL: ${url}`);
      }
      await page.waitForTimeout(200);
    }

    // If no session URL, use whatever page URL we have
    const finalUrl = page.url();
    console.log(`  [Webfuse] Session URL (timeout): ${finalUrl}`);
    return finalUrl;
  }

  /**
   * Extract the Surfly session key from a session URL.
   * Example: https://webfu.se/s20EggChcfjSTkCdWSW0z2TrFw → s20EggChcfjSTkCdWSW0z2TrFw
   */
  private extractSessionKey(url: string): string {
    const match = url.match(/\/(s\w{10,})(\/|$)/);
    return match ? match[1]! : 'unknown';
  }

  /**
   * Wait for the Webfuse-proxied page to finish loading.
   */
  private async waitForPageReady(page: Page): Promise<void> {
    // Wait for network idle with short timeout (page may already be loaded)
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // Acceptable — some pages don't reach networkidle in time
    }
  }

  /**
   * Return the session key for the last opened page (for MCP control).
   */
  getLastSessionKey(): string | null {
    return this.activeSessions.at(-1)?.sessionKey ?? null;
  }

  /**
   * Close browser and clean up.
   */
  async close(): Promise<void> {
    this.activeSessions = [];
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
