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
  private createFramePage(page: Page, frame: Frame, context: import('playwright').BrowserContext): Page {
    const targetUrl = this.targetUrl;

    // Normalize Surfly proxy frame URLs back to the real Magento URL.
    //
    // Surfly rewrites all URLs in the proxied HTML to its own proxy format:
    //   https://webfuse-it-p.webfu.se/.../ST/{key}//.../{real_path}?{real_query}&SURFLY_TAB_PREFIX=...&SURFLY=T
    // For product pages without a real query string, Surfly uses a different format:
    //   .../ST/{key}//.../{real_path}?SURFLYFRAMEORIGIN=https://target?SURFLY_TAB_PREFIX=...
    //
    // This function extracts {real_path}?{real_query} and reconstructs the Magento URL.
    function normalizeFrameUrl(url: string): string {
      if (!url || !url.includes('webfu.se')) return url;
      try {
        const origin = new URL(targetUrl).origin;
        // Extract everything after /ST/{key}/{one or more slashes}
        const m = url.match(/\/ST\/[^/]+\/+(.*)/);
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

    // Convert a real Magento URL into a Surfly proxy URL for the current session.
    // Surfly URLs look like: https://webfuse-it-p.webfu.se/.../ST/{key}//{path}?SURFLY_TAB_PREFIX=...
    // We extract the proxy prefix from the current frame URL and append the real path.
    function toSurflyProxyUrl(realUrl: string): string {
      const fUrl = frame.url();
      if (!fUrl || !fUrl.includes('webfu.se')) return '';
      try {
        // Extract everything up to and including the trailing slashes after the session key
        const prefixMatch = fUrl.match(/(https:\/\/[^/]+\/.*?\/ST\/[^/]+\/+)/);
        if (!prefixMatch) return '';
        const proxyPrefix = prefixMatch[1]!;
        const r = new URL(realUrl);
        const realPath = r.pathname.substring(1) + (r.search || '');
        const sep = realPath.includes('?') ? '&' : '?';
        return proxyPrefix + realPath + sep + 'SURFLY_TAB_PREFIX=_surfly_tab1000';
      } catch { return ''; }
    }

    // Extract the proxied origin from the current frame URL (the real site hostname).
    function currentProxiedOrigin(): string {
      const fUrl = frame.url();
      if (!fUrl || !fUrl.includes('webfu.se')) return '';
      try {
        // Extract the real host from Surfly proxy path: /ST/{key}//{host}/...
        const m = fUrl.match(/\/ST\/[^/]+\/+(([^/]+\.(?:it|com|net|org|io|co)(?:\.[a-z]{2})?))(\/|$)/);
        if (m) return m[1]!.toLowerCase();
      } catch {}
      return '';
    }

    // Helper: navigate the Surfly proxy to a URL.
    // For same-origin navigation: navigate the frame directly (Surfly proxy URL construction).
    // For cross-origin navigation: use the Surfly address bar so the proxy re-opens the new domain.
    async function navigateProxy(target: Page, url: string): Promise<void> {
      const cleanUrl = url.replace(/(https?:\/\/[^/?#]+)\/\//g, '$1/');

      // Record current frame URL before navigating (to detect when navigation happens)
      const prevFrameUrl = frame.url();

      // If we're already on the target URL, no navigation needed — just settle
      const normalizedPrev = normalizeFrameUrl(prevFrameUrl);
      if (normalizedPrev === cleanUrl || normalizedPrev.split('?')[0] === cleanUrl.split('?')[0]) {
        await target.waitForTimeout(3000);
        return;
      }

      // Check whether destination is same-origin as the current proxy session
      let destHost = '';
      try { destHost = new URL(cleanUrl).hostname.toLowerCase(); } catch {}
      const proxiedOrigin = currentProxiedOrigin();
      const isSameOrigin = proxiedOrigin && destHost && destHost === proxiedOrigin;

      if (isSameOrigin) {
        // Same-origin: navigate the proxy frame directly via Surfly proxy URL (fast, no address bar)
        const surflyProxyUrl = toSurflyProxyUrl(cleanUrl);
        if (surflyProxyUrl) {
          await frame.evaluate((u: string) => { window.location.href = u; }, surflyProxyUrl);
        }
      } else {
        // Cross-origin: use Surfly address bar to re-open the new domain through the proxy.
        // After the proxy session starts, Surfly hides the address bar (sinput). We force it
        // visible via JS so we can type the new URL.
        await target.evaluate(() => {
          const s = document.querySelector('input.sinput') as HTMLInputElement | null;
          if (!s) return;
          s.style.setProperty('display', 'block', 'important');
          s.style.setProperty('visibility', 'visible', 'important');
          s.style.setProperty('opacity', '1', 'important');
          // Walk up and un-hide ancestors
          let p = s.parentElement;
          while (p && p !== document.body) {
            const cs = window.getComputedStyle(p);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
              (p as HTMLElement).style.setProperty('display', 'block', 'important');
              (p as HTMLElement).style.setProperty('visibility', 'visible', 'important');
              (p as HTMLElement).style.setProperty('opacity', '1', 'important');
            }
            p = p.parentElement;
          }
        });
        // The sinput is covered by the iframe overlay — use JS to set value + dispatch Enter.
        // We bypass Playwright's pointer-event path entirely.
        const navigated = await target.evaluate((url: string) => {
          const s = document.querySelector('input.sinput') as HTMLInputElement | null;
          if (!s) return false;
          // Force visible (needed so Surfly's listener processes the submit)
          s.style.setProperty('display', 'block', 'important');
          s.style.setProperty('visibility', 'visible', 'important');
          s.style.setProperty('opacity', '1', 'important');
          let p = s.parentElement;
          while (p && p !== document.body) {
            (p as HTMLElement).style.setProperty('display', 'block', 'important');
            (p as HTMLElement).style.setProperty('visibility', 'visible', 'important');
            p = p.parentElement;
          }
          // Focus and set value
          s.focus();
          s.select();
          s.value = url;
          // Dispatch input + change so framework picks up the value
          s.dispatchEvent(new Event('input', { bubbles: true }));
          s.dispatchEvent(new Event('change', { bubbles: true }));
          // Dispatch Enter key events
          const enterDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
          const enterPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
          const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
          s.dispatchEvent(enterDown);
          s.dispatchEvent(enterPress);
          s.dispatchEvent(enterUp);
          // Also submit the form if present
          const form = s.closest('form');
          if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return true;
        }, cleanUrl);
        if (!navigated) {
          // sinput not found — fallback to proxy URL navigation
          const surflyProxyUrl = toSurflyProxyUrl(cleanUrl);
          if (surflyProxyUrl) {
            await frame.evaluate((u: string) => { window.location.href = u; }, surflyProxyUrl);
          } else {
            throw new Error(`Cannot navigate to ${cleanUrl}: sinput not found and no proxy URL`);
          }
        }
      }

      // Wait for the proxy frame URL to change from the previous URL (navigation started)
      // then give the new page a moment to settle
      const deadline = Date.now() + 30000;
      let navigated = false;
      while (Date.now() < deadline) {
        const fUrl = frame.url();
        if (fUrl !== prevFrameUrl) {
          console.log(`  [Webfuse/nav] Frame URL changed → ${normalizeFrameUrl(fUrl).substring(0, 80)}`);
          if (fUrl && !fUrl.includes('chrome-error') && !fUrl.includes('about:')) {
            navigated = true;
            // Give the page a bit more time to finish rendering (Magento/KO needs a few seconds)
            await target.waitForTimeout(4000);
            break;
          }
        }
        await target.waitForTimeout(500);
      }
      if (!navigated) {
        console.log(`  [Webfuse/nav] Frame URL did not change after 30s (prevUrl: ${normalizeFrameUrl(prevFrameUrl).substring(0, 60)})`);
        // Frame URL didn't change — Surfly may not have processed the Enter key.
        // Try clicking a Go/Submit button as fallback, then give up and continue
        const goBtn = await target.$('button[aria-label*="Go"], button[title*="Go"], button[type="submit"]').catch(() => null);
        if (goBtn) {
          await goBtn.click().catch(() => {});
          await target.waitForTimeout(5000);
        } else {
          await target.waitForTimeout(3000);
        }
      }
    }

    // We use a Proxy to intercept specific methods
    return new Proxy(page, {
      get(target, prop) {
        // goto: navigate inside the Surfly proxy instead of the outer page
        if (prop === 'goto') {
          return async (url: string, options?: Record<string, unknown>) => {
            // Normalize Surfly proxy URLs (e.g. from link.getAttribute('href')) to real Magento URLs
            const realUrl = normalizeFrameUrl(url);
            console.log(`  [Webfuse/frame] goto: ${realUrl}`);
            // Push current normalized URL to history before navigating
            const currentUrl = normalizeFrameUrl(frame.url());
            if (currentUrl && !currentUrl.includes('about:') && !currentUrl.includes('chrome-error')) {
              urlHistory.push(currentUrl);
            }
            try {
              await navigateProxy(target, realUrl);
            } catch {
              await target.waitForTimeout(3000);
            }
            return null as unknown as import('playwright').Response;
          };
        }

        // goBack: navigate to the previous URL via address bar
        if (prop === 'goBack') {
          return async (options?: Record<string, unknown>) => {
            console.log(`  [Webfuse/frame] goBack intercepted`);
            try {
              // Try URL history first (populated by goto calls)
              let backUrl = urlHistory.pop() ?? '';
              // Fall back to document.referrer if no history
              if (!backUrl) {
                backUrl = await frame.evaluate(() => document.referrer).catch(() => '');
              }
              if (backUrl) {
                console.log(`  [Webfuse/frame] goBack → ${backUrl.substring(0, 80)}`);
                await navigateProxy(target, backUrl);
              } else {
                console.log(`  [Webfuse/frame] goBack — no URL to go back to, waiting`);
                await target.waitForTimeout(3000);
              }
            } catch (e) {
              console.log(`  [Webfuse/frame] goBack failed: ${e}`);
            }
            return null as unknown as import('playwright').Response;
          };
        }

        // Forward $ and $$ to the proxy frame
        if (prop === '$') {
          return (selector: string) => frame.$(selector);
        }
        if (prop === '$$') {
          return (selector: string) => frame.$$(selector);
        }
        if (prop === '$eval') {
          return (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
            frame.$eval(selector as string, fn as (...args: unknown[]) => unknown, ...args);
        }
        if (prop === '$$eval') {
          return (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
            frame.$$eval(selector as string, fn as (...args: unknown[]) => unknown, ...args);
        }
        if (prop === 'waitForFunction') {
          return (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
            (frame as unknown as Record<string, (...a: unknown[]) => unknown>)['waitForFunction'](fn, ...args);
        }
        if (prop === 'waitForSelector') {
          return (selector: string, options?: Record<string, unknown>) => {
            // Double timeouts when going through Surfly proxy (extra latency)
            const opts = options ? { ...options } : {};
            if (typeof opts['timeout'] === 'number') {
              opts['timeout'] = Math.max((opts['timeout'] as number) * 2, 40000);
            } else {
              opts['timeout'] = 40000;
            }
            return frame.waitForSelector(selector as string, opts as Parameters<Frame['waitForSelector']>[1]);
          };
        }
        if (prop === 'waitForURL') {
          // Best-effort: watch frame URL
          return async (pattern: string | RegExp, options?: Record<string, unknown>) => {
            const deadline = Date.now() + ((options?.timeout as number) ?? 30000);
            while (Date.now() < deadline) {
              const u = frame.url();
              if (typeof pattern === 'string' && u.includes(pattern.replace(/\*/g, ''))) return;
              if (pattern instanceof RegExp && pattern.test(u)) return;
              await target.waitForTimeout(500);
            }
          };
        }
        if (prop === 'fill') {
          return (selector: string, value: string, options?: Record<string, unknown>) => frame.fill(selector, value, options as Parameters<Frame['fill']>[2]);
        }
        if (prop === 'click') {
          return (selector: string, options?: Record<string, unknown>) => frame.click(selector, options as Parameters<Frame['click']>[1]);
        }
        if (prop === 'type') {
          return (selector: string, text: string, options?: Record<string, unknown>) => frame.type(selector, text, options as Parameters<Frame['type']>[2]);
        }
        if (prop === 'selectOption') {
          return (selector: string, values: unknown, options?: Record<string, unknown>) =>
            frame.selectOption(selector, values as string, options as Parameters<Frame['selectOption']>[2]);
        }
        if (prop === 'evaluate') {
          return (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => frame.evaluate(fn, ...args);
        }
        if (prop === 'title') {
          return () => frame.title();
        }
        if (prop === 'url') {
          return () => normalizeFrameUrl(frame.url());
        }
        if (prop === 'content') {
          return () => frame.content();
        }
        if (prop === 'waitForLoadState') {
          return (state?: string, options?: Record<string, unknown>) =>
            frame.waitForLoadState(state as Parameters<Frame['waitForLoadState']>[0], options as Parameters<Frame['waitForLoadState']>[1]);
        }
        if (prop === 'waitForTimeout') {
          return (ms: number) => target.waitForTimeout(ms);
        }
        if (prop === 'context') {
          return () => context;
        }
        if (prop === 'screenshot') {
          return (options?: Record<string, unknown>) => target.screenshot(options as Parameters<Page['screenshot']>[0]);
        }
        // Default: forward to the outer page
        const val = (target as unknown as Record<string | symbol, unknown>)[prop as string | symbol];
        if (typeof val === 'function') return val.bind(target);
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
