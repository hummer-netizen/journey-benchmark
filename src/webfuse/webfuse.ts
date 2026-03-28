import { chromium, type Browser, type Page } from 'playwright';
import type { AutomationProvider } from './provider.js';

/**
 * Webfuse Automation API provider.
 *
 * Creates a Surfly session pointing at the target URL, then connects
 * Playwright to the follower/leader URL so the benchmark runner drives
 * the page through the Webfuse proxy layer — exactly as described in
 * the implementation roadmap §10.
 *
 * Env vars:
 *   WEBFUSE_API_KEY — Surfly REST API key
 *   WEBFUSE_API_URL — API base (default: https://app.surfly.com)
 */
export class WebfuseProvider implements AutomationProvider {
  private apiKey: string;
  private apiUrl: string;
  private browser: Browser | null = null;
  private activeSessions: string[] = [];
  private headless: boolean;

  constructor(headless = true) {
    const apiKey = process.env['WEBFUSE_API_KEY'];
    if (!apiKey) {
      throw new Error('WEBFUSE_API_KEY is not set — cannot use Webfuse provider');
    }
    this.apiKey = apiKey;
    this.apiUrl = process.env['WEBFUSE_API_URL'] ?? 'https://app.surfly.com';
    this.headless = headless;
  }

  /**
   * Create a Surfly session pointing at the given URL and return a Playwright
   * Page connected through the Webfuse proxy.
   */
  async openUrl(url: string): Promise<Page> {
    // 1. Create a Surfly session via REST API
    const session = await this.createSession(url);
    this.activeSessions.push(session.id);

    // 2. Launch browser if needed
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }

    // 3. Open the leader URL — Webfuse proxies the target URL through its layer
    const context = await this.browser.newContext();
    const page = await context.newPage();
    await page.goto(session.leader_link, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 4. Wait for Webfuse to finish loading the proxied page
    //    The Surfly loader overlay disappears once the target is ready
    await page.waitForFunction(
      () => !document.querySelector('#surfly-loading, .surfly-loading, [data-surfly-loading]'),
      { timeout: 30000 },
    ).catch(() => {
      // If no loader found, the page may already be ready
    });

    return page;
  }

  /**
   * Create a co-browsing / automation session via the Surfly REST API.
   */
  private async createSession(targetUrl: string): Promise<SurflySession> {
    const response = await fetch(`${this.apiUrl}/v2/sessions/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        api_key: this.apiKey,
        // Automation-friendly settings
        agent_can_request_control: false,
        block_until_leader_joins: false,
        hide_session_ui: true,
        splash: false,
        autohide_button: true,
        allow_original_file_download: true,
        cookie_transfer_enabled: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '(no body)');
      throw new Error(
        `Surfly session creation failed (${response.status}): ${body}`,
      );
    }

    const data = await response.json() as SurflySession;
    if (!data.leader_link) {
      throw new Error('Surfly session response missing leader_link');
    }

    console.log(`  [Webfuse] Session ${data.id} created → ${targetUrl}`);
    return data;
  }

  /**
   * End all active Surfly sessions and close the browser.
   */
  async close(): Promise<void> {
    // Terminate active Surfly sessions
    for (const sessionId of this.activeSessions) {
      try {
        await fetch(`${this.apiUrl}/v2/sessions/${sessionId}/end/`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: this.apiKey }),
        });
      } catch {
        // Best-effort cleanup
      }
    }
    this.activeSessions = [];

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

/** Surfly session response shape */
interface SurflySession {
  id: string;
  leader_link: string;
  follower_link: string;
  start_time: string;
  end_time: string | null;
  session_key: string;
}
