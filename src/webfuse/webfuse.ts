import { chromium, type Browser, type Page, type Frame } from 'playwright';
import type { AutomationProvider } from './provider.js';

/**
 * Webfuse Automation API provider.
 *
 * Flow (per implementation roadmap D3):
 * 1. Launch Chromium and navigate to the Webfuse space URL
 * 2. Webfuse redirects to a session URL (e.g. https://webfu.se/sXXX)
 * 3. Type the target URL into Surfly's address bar to begin proxied navigation
 * 4. Automation runs through the Surfly proxy frame (_surfly_tab1000)
 * 5. The session_key is available for MCP control
 *
 * Env vars:
 *   WEBFUSE_API_KEY   — REST API token (ck_...) for webfu.se
 *   WEBFUSE_SPACE_URL — Webfuse space URL to open (e.g. https://webfu.se/+benchmark-webarena/)
 *   WEBFUSE_TARGET_URL — Target site URL to open inside the space
 */
export class WebfuseProvider implements AutomationProvider {
  private apiKey: string;
  private spaceUrl: string;
  private targetUrl: string;
  private browser: Browser | null = null;
  private activeSessions: Array<{ page: Page; frame: Frame; sessionKey: string }> = [];
  private headless: boolean;

  constructor(headless = true) {
    const apiKey = process.env['WEBFUSE_API_KEY'];
    if (!apiKey) {
      throw new Error('WEBFUSE_API_KEY is not set — cannot use Webfuse provider');
    }
    this.apiKey = apiKey;
    this.spaceUrl = process.env['WEBFUSE_SPACE_URL'] ?? 'https://webfu.se/+benchmark-webarena/';
    this.targetUrl = process.env['WEBFUSE_TARGET_URL'] ?? 'https://webarena-shop.webfuse.it/';
    this.headless = headless;
  }

  /**
   * Open the Webfuse space, navigate to the target URL via Surfly's address bar,
   * and return a Page-like proxy that forwards calls to the Surfly proxy frame.
   *
   * The Surfly proxy wraps the target URL — automation runs through the Webfuse layer.
   */
  async openUrl(requestedUrl: string): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();

    // Navigate to the Webfuse space — Surfly creates a session and shows a blank tab
    const targetUrl = requestedUrl || this.targetUrl;
    console.log(`  [Webfuse] Opening space: ${this.spaceUrl}`);
    await page.goto(this.spaceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for session URL redirect (pattern: /sXXX)
    const sessionUrl = await this.waitForSessionUrl(page);
    const sessionKey = this.extractSessionKey(sessionUrl);
    console.log(`  [Webfuse] Session: ${sessionKey} — ${sessionUrl}`);

    // Type the target URL into Surfly's address bar
    const urlInput = await page.waitForSelector(
      'input[placeholder*="URL"], input[placeholder*="url"], input[type="url"], input[type="text"]',
      { timeout: 10000, state: 'visible' }
    );
    await urlInput.click();
    await urlInput.fill(targetUrl);
    await urlInput.press('Enter');
    console.log(`  [Webfuse] Navigating proxy to: ${targetUrl}`);

    // Wait for the Surfly proxy frame to load the target
    const proxyFrame = await this.waitForProxyFrame(page);
    console.log(`  [Webfuse] Proxy frame loaded: ${proxyFrame.url().substring(0, 100)}`);

    // Return a FramePage wrapper so journey code drives the proxy frame
    const framePage = this.createFramePage(page, proxyFrame, context);
    this.activeSessions.push({ page, frame: proxyFrame, sessionKey });
    return framePage;
  }

  /**
   * Wait for the Surfly proxy frame (_surfly_tab1000) to load a non-error page.
   */
  private async waitForProxyFrame(page: Page): Promise<Frame> {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const frames = page.frames();
      for (const f of frames) {
        const url = f.url();
        if (f.name().startsWith('_surfly_tab1000') && url && !url.includes('chrome-error') && !url.includes('about:')) {
          // Wait a moment for the frame to stabilise
          await page.waitForTimeout(2000);
          return f;
        }
      }
      await page.waitForTimeout(500);
    }
    // Fallback: return the best available frame
    const frames = page.frames();
    const surfly = frames.find(f => f.name().startsWith('_surfly_tab1000'));
    if (surfly) return surfly;
    throw new Error('Webfuse proxy frame (_surfly_tab1000) did not load within 30s');
  }

  /**
   * Create a Page-compatible wrapper that forwards navigation and interaction
   * to the Surfly proxy frame while keeping page-level APIs (goto, screenshot, etc.).
   *
   * Journey steps call page.goto(url) and page.$(selector). We intercept goto to
   * navigate inside the Surfly proxy (via the address bar) instead, and forward
   * all other calls to the proxy frame.
   */
  private createFramePage(page: Page, initialFrame: Frame, context: import('playwright').BrowserContext): Page {
    const self = this;

    // Mutable session state — updated on cross-origin reopen
    const state: { page: Page; frame: Frame; ctx: import('playwright').BrowserContext } = {
      page,
      frame: initialFrame,
      ctx: context,
    };

    // Current "real" target URL (updated when session is reopened for a new host)
    let currentTargetUrl = this.targetUrl;

    // Normalize Surfly proxy frame URLs back to the real URL for the current target host.
    //
    // Surfly rewrites all URLs in the proxied HTML to its own proxy format:
    //   https://webfuse-it-p.webfu.se/.../ST/{key}//.../{real_path}?{real_query}&SURFLY_TAB_PREFIX=...&SURFLY=T
    // For product pages without a real query string, Surfly uses a different format:
    //   .../ST/{key}//.../{real_path}?SURFLYFRAMEORIGIN=https://target?SURFLY_TAB_PREFIX=...
    //
    // This function extracts {real_path}?{real_query} and reconstructs the real URL.
    function normalizeFrameUrl(url: string): string {
      if (!url || !url.includes('webfu.se')) return url;
      try {
        // Try to get origin from the frame URL itself (extract proxied host)
        const hostMatch = url.match(/\/ST\/[^/]+\/+([^/?]+)/);
        const origin = hostMatch
          ? `https://${hostMatch[1]}`
          : new URL(currentTargetUrl).origin;
        // Extract everything after /ST/{key}/{one or more slashes}
        const m = url.match(/\/ST\/[^/]+\/+[^/?]+\/(.*)/);
        if (!m) return url;

        let rest = m[1]!;
        // Strip ?SURFLYFRAMEORIGIN=... and everything after (Surfly appends this to product URLs)
        rest = rest.replace(/[?&]SURFLYFRAMEORIGIN[^]*$/, '');
        // Strip remaining Surfly-specific params
        rest = rest.replace(/[?&]SURFLY_TAB_PREFIX=[^&]*/g, '');
        rest = rest.replace(/[?&]SURFLY(?:=[^&]*)?(?=$|[&?])/g, '');
        // Clean trailing separators
        rest = rest.replace(/[?&]+$/, '');

        return origin + '/' + rest;
      } catch {}
      return url;
    }

    // Track URL history for goBack() support
    const urlHistory: string[] = [];

    // Extract the proxied hostname from the current frame URL.
    function currentProxiedHost(): string {
      const fUrl = state.frame.url();
      if (!fUrl || !fUrl.includes('webfu.se')) return '';
      try {
        const m = fUrl.match(/\/ST\/[^/]+\/+([^/?]+)/);
        return m ? m[1]!.toLowerCase() : '';
      } catch {}
      return '';
    }

    // Convert a real URL into a Surfly proxy URL for the current session.
    // Surfly proxy URLs look like:
    //   https://webfuse-it-p.webfu.se/.../ST/{key}//{host}/{path}?SURFLY_TAB_PREFIX=...
    function toSurflyProxyUrl(realUrl: string): string {
      const fUrl = state.frame.url();
      if (!fUrl || !fUrl.includes('webfu.se')) return '';
      try {
        // Extract base + session key: everything up to /ST/{key}
        const baseMatch = fUrl.match(/(https:\/\/[^/]+\/.*?\/ST\/[^/]+)\//);
        if (!baseMatch) return '';
        const base = baseMatch[1]!;
        const r = new URL(realUrl);
        // Build: {base}//{host}/{path}?{query}&SURFLY_TAB_PREFIX=...
        const hostAndPath = r.hostname + r.pathname + (r.search || '');
        const sep = hostAndPath.includes('?') ? '&' : '?';
        return base + '//' + hostAndPath + sep + 'SURFLY_TAB_PREFIX=_surfly_tab1000';
      } catch { return ''; }
    }

    // Reopen a fresh Surfly session for a different target URL (cross-origin navigation).
    // Closes the current browser context and opens a new one.
    async function reopenSession(newTargetUrl: string): Promise<void> {
      console.log(`  [Webfuse/reopen] Cross-origin navigation → ${newTargetUrl}`);
      // Close old context
      try { await state.ctx.close(); } catch {}
      // Open new session
      if (!self.browser) throw new Error('Browser not initialized');
      const newCtx = await self.browser.newContext();
      const newPage = await newCtx.newPage();
      console.log(`  [Webfuse] Opening space: ${self.spaceUrl}`);
      await newPage.goto(self.spaceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const sessionUrl = await self.waitForSessionUrl(newPage);
      const sessionKey = self.extractSessionKey(sessionUrl);
      console.log(`  [Webfuse] Session: ${sessionKey} — ${sessionUrl}`);
      const urlInput = await newPage.waitForSelector(
        'input[placeholder*="URL"], input[placeholder*="url"], input[type="url"], input[type="text"]',
        { timeout: 10000, state: 'visible' }
      );
      await urlInput.click();
      await urlInput.fill(newTargetUrl);
      await urlInput.press('Enter');
      console.log(`  [Webfuse] Navigating proxy to: ${newTargetUrl}`);
      const newFrame = await self.waitForProxyFrame(newPage);
      console.log(`  [Webfuse] Proxy frame loaded: ${newFrame.url().substring(0, 100)}`);
      // Update mutable state
      state.page = newPage;
      state.frame = newFrame;
      state.ctx = newCtx;
      currentTargetUrl = newTargetUrl;
      self.activeSessions.push({ page: newPage, frame: newFrame, sessionKey });
    }

    // Helper: navigate the Surfly proxy to a URL.
    // Detects cross-origin changes and reopens a fresh session for the new host.
    async function navigateProxy(url: string): Promise<void> {
      const cleanUrl = url.replace(/(https?:\/\/[^/?#]+)\/\//g, '$1/');
      const prevFrameUrl = state.frame.url();

      // Already on target — just settle
      const normalizedPrev = normalizeFrameUrl(prevFrameUrl);
      if (normalizedPrev === cleanUrl || normalizedPrev.split('?')[0] === cleanUrl.split('?')[0]) {
        await state.page.waitForTimeout(3000);
        return;
      }

      // Check for cross-origin relative to the current session's target host.
      // Compare against currentTargetUrl (reliable) rather than parsing the proxy frame URL.
      let destHost = '';
      try { destHost = new URL(cleanUrl).hostname.toLowerCase(); } catch {}
      let sessionHost = '';
      try { sessionHost = new URL(currentTargetUrl).hostname.toLowerCase(); } catch {}
      if (destHost && sessionHost && destHost !== sessionHost) {
        await reopenSession(cleanUrl);
        return;
      }

      // Same-origin: navigate via Surfly proxy URL
      const surflyProxyUrl = toSurflyProxyUrl(cleanUrl);
      if (surflyProxyUrl) {
        console.log(`  [Webfuse/nav] Proxy URL: ${surflyProxyUrl.substring(0, 120)}`);
        await state.frame.evaluate((u: string) => { window.location.href = u; }, surflyProxyUrl);
      } else {
        throw new Error(`Cannot navigate to ${cleanUrl}: unable to construct proxy URL from frame ${state.frame.url()}`);
      }

      // Wait for the proxy frame URL to change from the previous URL (navigation started)
      // then give the new page a moment to settle
      const deadline = Date.now() + 30000;
      let navigated = false;
      while (Date.now() < deadline) {
        const fUrl = state.frame.url();
        if (fUrl !== prevFrameUrl) {
          console.log(`  [Webfuse/nav] Frame URL changed → ${normalizeFrameUrl(fUrl).substring(0, 80)}`);
          if (fUrl && !fUrl.includes('chrome-error') && !fUrl.includes('about:')) {
            navigated = true;
            await state.page.waitForTimeout(4000);
            break;
          }
        }
        await state.page.waitForTimeout(500);
      }
      if (!navigated) {
        console.log(`  [Webfuse/nav] Frame URL did not change after 30s (prevUrl: ${normalizeFrameUrl(prevFrameUrl).substring(0, 60)})`);
        await state.page.waitForTimeout(3000);
      }
    }

    // We use a Proxy to intercept specific methods
    // Note: 'page' here is the original outer page (kept for fallback/default forwarding),
    // but all frame interactions use state.frame / state.page (mutable, updated on reopen)
    return new Proxy(page, {
      get(_outerPage, prop) {
        // goto: navigate inside the Surfly proxy; detect cross-origin and reopen session
        if (prop === 'goto') {
          return async (url: string, _options?: Record<string, unknown>) => {
            const realUrl = normalizeFrameUrl(url);
            console.log(`  [Webfuse/frame] goto: ${realUrl}`);
            const currentUrl = normalizeFrameUrl(state.frame.url());
            if (currentUrl && !currentUrl.includes('about:') && !currentUrl.includes('chrome-error')) {
              urlHistory.push(currentUrl);
            }
            try {
              await navigateProxy(realUrl);
            } catch {
              await state.page.waitForTimeout(3000);
            }
            return null as unknown as import('playwright').Response;
          };
        }

        // goBack: navigate to the previous URL
        if (prop === 'goBack') {
          return async (_options?: Record<string, unknown>) => {
            console.log(`  [Webfuse/frame] goBack intercepted`);
            try {
              let backUrl = urlHistory.pop() ?? '';
              if (!backUrl) {
                backUrl = await state.frame.evaluate(() => document.referrer).catch(() => '');
              }
              if (backUrl) {
                console.log(`  [Webfuse/frame] goBack → ${backUrl.substring(0, 80)}`);
                await navigateProxy(backUrl);
              } else {
                console.log(`  [Webfuse/frame] goBack — no URL to go back to, waiting`);
                await state.page.waitForTimeout(3000);
              }
            } catch (e) {
              console.log(`  [Webfuse/frame] goBack failed: ${e}`);
            }
            return null as unknown as import('playwright').Response;
          };
        }

        // Forward $ and $$ to the proxy frame (use state.frame for live binding)
        if (prop === '$') {
          return (selector: string) => state.frame.$(selector);
        }
        if (prop === '$$') {
          return (selector: string) => state.frame.$$(selector);
        }
        if (prop === '$eval') {
          return (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
            state.frame.$eval(selector as string, fn as (...args: unknown[]) => unknown, ...args);
        }
        if (prop === '$$eval') {
          return (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
            state.frame.$$eval(selector as string, fn as (...args: unknown[]) => unknown, ...args);
        }
        if (prop === 'waitForFunction') {
          return (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
            (state.frame as unknown as Record<string, (...a: unknown[]) => unknown>)['waitForFunction'](fn, ...args);
        }
        if (prop === 'waitForSelector') {
          return (selector: string, options?: Record<string, unknown>) => {
            const opts = options ? { ...options } : {};
            if (typeof opts['timeout'] === 'number') {
              opts['timeout'] = Math.max((opts['timeout'] as number) * 2, 40000);
            } else {
              opts['timeout'] = 40000;
            }
            return state.frame.waitForSelector(selector as string, opts as Parameters<Frame['waitForSelector']>[1]);
          };
        }
        if (prop === 'waitForURL') {
          return async (pattern: string | RegExp, options?: Record<string, unknown>) => {
            const deadline = Date.now() + ((options?.timeout as number) ?? 30000);
            while (Date.now() < deadline) {
              const u = state.frame.url();
              if (typeof pattern === 'string' && u.includes(pattern.replace(/\*/g, ''))) return;
              if (pattern instanceof RegExp && pattern.test(u)) return;
              await state.page.waitForTimeout(500);
            }
          };
        }
        if (prop === 'fill') {
          return (selector: string, value: string, options?: Record<string, unknown>) => state.frame.fill(selector, value, options as Parameters<Frame['fill']>[2]);
        }
        if (prop === 'click') {
          return (selector: string, options?: Record<string, unknown>) => state.frame.click(selector, options as Parameters<Frame['click']>[1]);
        }
        if (prop === 'type') {
          return (selector: string, text: string, options?: Record<string, unknown>) => state.frame.type(selector, text, options as Parameters<Frame['type']>[2]);
        }
        if (prop === 'selectOption') {
          return (selector: string, values: unknown, options?: Record<string, unknown>) =>
            state.frame.selectOption(selector, values as string, options as Parameters<Frame['selectOption']>[2]);
        }
        if (prop === 'evaluate') {
          return (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => state.frame.evaluate(fn, ...args);
        }
        if (prop === 'title') {
          return () => state.frame.title();
        }
        if (prop === 'url') {
          return () => normalizeFrameUrl(state.frame.url());
        }
        if (prop === 'content') {
          return () => state.frame.content();
        }
        if (prop === 'waitForLoadState') {
          return (loadState?: string, options?: Record<string, unknown>) =>
            state.frame.waitForLoadState(loadState as Parameters<Frame['waitForLoadState']>[0], options as Parameters<Frame['waitForLoadState']>[1]);
        }
        if (prop === 'waitForTimeout') {
          return (ms: number) => state.page.waitForTimeout(ms);
        }
        if (prop === 'context') {
          return () => state.ctx;
        }
        if (prop === 'screenshot') {
          return (options?: Record<string, unknown>) => state.page.screenshot(options as Parameters<Page['screenshot']>[0]);
        }
        // Default: forward to the outer page
        const val = (page as unknown as Record<string | symbol, unknown>)[prop as string | symbol];
        if (typeof val === 'function') return val.bind(page);
        return val;
      },
    });
  }

  /**
   * Wait for Surfly to redirect the page to a session URL (pattern: /sXXX).
   */
  private async waitForSessionUrl(page: Page): Promise<string> {
    const deadline = Date.now() + 15000;
    let lastUrl = page.url();
    while (Date.now() < deadline) {
      const url = page.url();
      if (url.match(/\/s\w{10,}(\/|$)/)) return url;
      if (url !== lastUrl) {
        lastUrl = url;
        console.log(`  [Webfuse] URL: ${url}`);
      }
      await page.waitForTimeout(200);
    }
    return page.url();
  }

  /**
   * Extract the Surfly session key from a session URL.
   */
  private extractSessionKey(url: string): string {
    const match = url.match(/\/(s\w{10,})(\/|$)/);
    return match ? match[1]! : 'unknown';
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
