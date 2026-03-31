import * as https from 'node:https';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';
import type { AutomationProvider } from './provider.js';
import { AutomationApi } from './automation-api.js';

const _require = createRequire(import.meta.url);

/**
 * WebfuseProvider — drives browser automation via the Webfuse Session MCP Server.
 *
 * All perception (domSnapshot, accessibilityTree) and actuation (click, type, etc.)
 * go through the Automation API. No local Chromium is used for actuation — a headless
 * browser is launched solely to act as the "tab owner" for the Webfuse session.
 *
 * Session lifecycle (per journey run):
 *   1. POST to WEBFUSE_SPACE_URL → get session_id + link
 *   2. Launch headless Chromium, navigate to session link (establishes tab owner)
 *   3. Wait for session tab to be ready
 *   4. Navigate to the target journey URL via MCP navigate tool
 *   5. Run journey steps via MCP (click, type, domSnapshot, etc.)
 *   6. On close(): terminate session via DELETE REST API, close browser
 *
 * Env vars:
 *   WEBFUSE_AUTOMATION_KEY — ak_* Space Automation API key (required)
 *   WEBFUSE_SPACE_URL      — Space URL to create sessions (default: https://webfu.se/+webfuse-mcp-demo/)
 *   WEBFUSE_MCP_ENDPOINT   — MCP server URL (default: https://session-mcp.webfu.se/mcp)
 */
export class WebfuseProvider implements AutomationProvider {
  private readonly apiKey: string;
  private readonly spaceUrl: string;
  private readonly mcpEndpoint: string;
  private _automationApi: AutomationApi | null = null;
  private _activeSessionId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _browser: any | null = null;

  constructor(_headless = true) {
    const apiKey = process.env['WEBFUSE_AUTOMATION_KEY'];
    if (!apiKey) throw new Error('WEBFUSE_AUTOMATION_KEY is not set — cannot use WebfuseProvider (Track C)');
    this.apiKey = apiKey;
    this.spaceUrl = process.env['WEBFUSE_SPACE_URL'] ?? 'https://webfu.se/+webfuse-mcp-demo/';
    this.mcpEndpoint = process.env['WEBFUSE_MCP_ENDPOINT'] ?? 'https://session-mcp.webfu.se/mcp';
  }

  private getApi(sessionId: string): AutomationApi {
    if (!this._automationApi) {
      this._automationApi = new AutomationApi({
        apiKey: this.apiKey,
        mcpEndpoint: this.mcpEndpoint,
      });
    }
    // Bind sessionId into the api instance for this run
    this._activeSessionId = sessionId;
    return this._automationApi;
  }

  /** Create a Webfuse session by POSTing to the space URL. Returns {session_id, link}. */
  private async createSession(): Promise<{ session_id: string; link: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(this.spaceUrl);
      const reqOptions: https.RequestOptions = {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 0 },
      };
      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { session_id: string; link: string };
            resolve(parsed);
          } catch {
            reject(new Error(`Failed to parse session creation response: ${data.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Session creation timed out')); });
      req.end();
    });
  }

  /** Launch headless Chromium and navigate to the session link to become the tab owner. */
  private async openSessionInBrowser(sessionLink: string): Promise<void> {
    // Dynamic require to avoid bundling issues
    const pw = _require('/home/deploy/projects/journey-benchmark/node_modules/playwright') as typeof import('playwright');
    this._browser = await pw.chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
    const page = await this._browser.newPage();
    await page.goto(sessionLink, { waitUntil: 'load', timeout: 20000 });
    console.log(`  [Webfuse] Tab owner browser at: ${page.url()}`);
    // Wait for session to initialize and register the tab
    await new Promise(r => setTimeout(r, 8000));
    console.log(`  [Webfuse] Session tab ready`);
  }

  /** Terminate a session via DELETE /api/v2/sessions/{id}/ — best-effort, never throws */
  private async terminateSession(id: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const reqOptions: https.RequestOptions = {
        hostname: 'webfu.se',
        port: 443,
        path: `/api/v2/sessions/${id}/`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      };
      const req = https.request(reqOptions, (res) => {
        res.resume();
        res.on('end', () => resolve());
      });
      req.on('error', (err) => {
        console.warn(`  [Webfuse] Warning: failed to terminate session ${id}: ${err.message}`);
        resolve();
      });
      req.setTimeout(5000, () => {
        req.destroy();
        console.warn(`  [Webfuse] Warning: session termination timed out for ${id}`);
        resolve();
      });
      req.end();
    });
  }

  async openUrl(url: string): Promise<Page> {
    // Step 1: Create a fresh Webfuse session
    console.log(`  [Webfuse] Creating session on space: ${this.spaceUrl}`);
    const { session_id, link } = await this.createSession();
    console.log(`  [Webfuse] Session created: ${session_id}`);
    this._activeSessionId = session_id;

    // Step 2: Open session in headless browser (establishes tab owner)
    await this.openSessionInBrowser(link);

    // Step 3: Get automation API and verify tab is active
    const api = this.getApi(session_id);

    // Step 4: Tab activation — verify active tab via page_info before navigating
    try {
      const info = await api.pageInfo(session_id);
      console.log(`  [Webfuse] Tab activated. Current URL: ${info.url}`);
    } catch (e) {
      console.warn(`  [Webfuse] Tab activation check failed: ${e instanceof Error ? e.message : e}`);
    }

    // Step 5: Navigate to the target URL
    console.log(`  [Webfuse] Navigating to: ${url}`);
    await api.navigate(session_id, url);

    // Verify navigation
    let confirmedUrl = url;
    try {
      const info = await api.pageInfo(session_id);
      if (info.url) confirmedUrl = info.url;
      console.log(`  [Webfuse] Navigated to: ${confirmedUrl}`);
    } catch { /* use requested URL */ }

    return this.createPageProxy(api, session_id, confirmedUrl) as unknown as Page;
  }

  private createPageProxy(api: AutomationApi, sessionId: string, initialUrl = ''): object {
    const urlHistory: string[] = [];
    let cachedUrl = initialUrl;

    const refreshUrl = async (): Promise<string> => {
      try {
        const info = await api.pageInfo(sessionId);
        if (info.url) cachedUrl = info.url;
        return cachedUrl;
      } catch {
        return cachedUrl;
      }
    };

    const makeHandle = (selector: string): Record<string, unknown> => ({
      click: () => api.click(sessionId, selector),
      fill: (value: string) => api.type(sessionId, selector, value, { overwrite: true }),
      type: (text: string) => api.type(sessionId, selector, text),
      press: (key: string) => api.keyPress(sessionId, selector, key),
      textContent: async () => {
        const html = await api.domSnapshot(sessionId);
        return extractText(html, selector);
      },
      getAttribute: async (name: string) => {
        const html = await api.domSnapshot(sessionId);
        return extractAttr(html, selector, name);
      },
      isVisible: async () => {
        const html = await api.domSnapshot(sessionId);
        return selectorIn(html, selector);
      },
      evaluate: async (_fn: unknown) => null,
      // Allow chained $$ calls on handles (e.g. waitForSelector result.$$('option'))
      $$: async (childSelector: string) => {
        const html = await api.domSnapshot(sessionId);
        const count = countIn(html, childSelector);
        return Array.from({ length: count }, (_, i) => makeHandle(`${childSelector}:nth-of-type(${i + 1})`));
      },
      $: async (childSelector: string) => {
        const html = await api.domSnapshot(sessionId);
        return selectorIn(html, childSelector) ? makeHandle(childSelector) : null;
      },
    });

    const proxy: Record<string, unknown> = {
      goto: async (targetUrl: string, _options?: Record<string, unknown>) => {
        if (cachedUrl) urlHistory.push(cachedUrl);
        console.log(`  [Webfuse/nav] goto: ${targetUrl}`);
        await api.navigate(sessionId, targetUrl);
        await refreshUrl();
        return null;
      },

      goBack: async (_options?: Record<string, unknown>) => {
        const backUrl = urlHistory.pop();
        if (backUrl) {
          console.log(`  [Webfuse/nav] goBack → ${backUrl}`);
          await api.navigate(sessionId, backUrl);
          await refreshUrl();
        }
        return null;
      },

      url: () => cachedUrl,
      title: async () => { const info = await api.pageInfo(sessionId); return info.title; },
      content: () => api.domSnapshot(sessionId, { webfuseIDs: true }),
      screenshot: (_options?: Record<string, unknown>) => api.guiSnapshot(sessionId),

      click: async (selector: string, _options?: Record<string, unknown>) => {
        await api.click(sessionId, selector);
        await sleep(300);
      },
      fill: async (selector: string, value: string, _options?: Record<string, unknown>) => {
        await api.type(sessionId, selector, value, { overwrite: true });
      },
      type: async (selector: string, text: string, _options?: Record<string, unknown>) => {
        await api.type(sessionId, selector, text, { overwrite: false });
      },
      press: async (selector: string, key: string, _options?: Record<string, unknown>) => {
        await api.keyPress(sessionId, selector, key);
        await sleep(300);
      },
      selectOption: async (selector: string, values: unknown, _options?: Record<string, unknown>) => {
        const value = Array.isArray(values)
          ? (typeof values[0] === 'object' && values[0] !== null && 'label' in (values[0] as object)
              ? (values[0] as { label: string }).label
              : (values[0] as string))
          : (typeof values === 'object' && values !== null && 'label' in (values as object)
              ? (values as { label: string }).label
              : (values as string));
        await api.select(sessionId, selector, value);
        return [];
      },
      check: async (selector: string) => { await api.click(sessionId, selector); },
      uncheck: async (selector: string) => { await api.click(sessionId, selector); },
      dispatchEvent: async (selector: string, type: string) => {
        if (type === 'click') await api.click(sessionId, selector);
      },

      $: async (selector: string) => {
        const html = await api.domSnapshot(sessionId);
        return selectorIn(html, selector) ? makeHandle(selector) : null;
      },
      $$: async (selector: string) => {
        const html = await api.domSnapshot(sessionId);
        const count = countIn(html, selector);
        return Array.from({ length: count }, (_, i) => makeHandle(`${selector}:nth-of-type(${i + 1})`));
      },
      $eval: async (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        void fn; void args;
        return extractText(await api.domSnapshot(sessionId), selector);
      },
      $$eval: async (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        void fn; void args;
        return [extractText(await api.domSnapshot(sessionId), selector)];
      },

      isVisible: async (selector: string) => selectorIn(await api.domSnapshot(sessionId), selector),
      isChecked: async (selector: string) => {
        const html = await api.domSnapshot(sessionId);
        return selectorIn(html, selector) && html.includes('checked');
      },
      textContent: async (selector: string) => extractText(await api.domSnapshot(sessionId), selector),
      evaluate: async (fn: unknown, ...args: unknown[]) => { void fn; void args; return api.domSnapshot(sessionId); },

      waitForSelector: async (selector: string, options?: Record<string, unknown>) => {
        const timeout = (options?.['timeout'] as number | undefined) ?? 30000;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          try {
            const html = await api.domSnapshot(sessionId);
            if (selectorIn(html, selector)) return makeHandle(selector);
          } catch { /* retry */ }
          await sleep(1000);
        }
        throw new Error(`Timeout waiting for selector: ${selector}`);
      },
      waitForURL: async (pattern: string | RegExp, options?: Record<string, unknown>) => {
        const timeout = (options?.['timeout'] as number | undefined) ?? 30000;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          const url = await refreshUrl();
          if (typeof pattern === 'string' && url.includes(pattern.replace(/\*/g, ''))) return;
          if (pattern instanceof RegExp && pattern.test(url)) return;
          await sleep(500);
        }
      },
      waitForLoadState: async (_state?: string) => { await api.wait(sessionId).catch(() => {}); },
      waitForTimeout: (ms: number) => sleep(ms),
      waitForFunction: async (_fn: unknown, ..._args: unknown[]) => { await sleep(2000); return null; },

      locator: (selector: string, _options?: Record<string, unknown>) => ({
        click: () => api.click(sessionId, selector),
        fill: (value: string) => api.type(sessionId, selector, value, { overwrite: true }),
        type: (text: string) => api.type(sessionId, selector, text),
        press: (key: string) => api.keyPress(sessionId, selector, key),
        first: () => ({
          click: () => api.click(sessionId, selector),
          fill: (value: string) => api.type(sessionId, selector, value, { overwrite: true }),
        }),
        nth: (_index: number) => ({
          click: () => api.click(sessionId, selector),
          fill: (value: string) => api.type(sessionId, selector, value, { overwrite: true }),
        }),
        waitFor: async (options?: Record<string, unknown>) => {
          const timeout = (options?.['timeout'] as number | undefined) ?? 30000;
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const html = await api.domSnapshot(sessionId);
            if (selectorIn(html, selector)) return;
            await sleep(1000);
          }
        },
        isVisible: async () => selectorIn(await api.domSnapshot(sessionId), selector),
      }),

      context: () => ({ newPage: async () => proxy, close: async () => {} }),
    };

    return proxy;
  }

  getAutomationApi(): AutomationApi | null { return this._automationApi; }
  getActiveSessionId(): string | null { return this._activeSessionId; }

  async close(): Promise<void> {
    // Step 1: Terminate Webfuse session (best-effort)
    if (this._activeSessionId) {
      console.log(`  [Webfuse] Terminating session: ${this._activeSessionId}`);
      await this.terminateSession(this._activeSessionId);
    }
    // Step 2: Close headless browser
    if (this._browser) {
      try { await this._browser.close(); } catch { /* ignore */ }
      this._browser = null;
    }
    // Step 3: Log audit summary
    if (this._automationApi) {
      const log = this._automationApi.auditLog;
      if (log.length > 0) {
        console.log(`  [Webfuse] Session closed. Audit log: ${log.length} tool calls`);
      }
    }
    this._automationApi = null;
    this._activeSessionId = null;
  }
}

// ---------------------------------------------------------------------------
// HTML helpers — simple regex-based, no external deps
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function selectorIn(html: string, selector: string): boolean {
  // Handle comma-separated selectors: return true if any match
  if (selector.includes(',')) {
    return selector.split(',').some(s => selectorIn(html, s.trim()));
  }
  // Strip pseudo-selectors like :not(...), :nth-of-type(...), :visible for matching
  const clean = selector.replace(/:[a-z-]+(\([^)]*\))?/g, '').trim();
  // Find the last meaningful part (for descendant selectors like "ol.products .product-item-link")
  const parts = clean.split(/\s+/);
  const last = parts[parts.length - 1] ?? clean;

  const idM = last.match(/^#?([\w-]+)#([\w-]+)|#([\w-]+)/);
  const justId = last.match(/^#([\w-]+)/);
  if (justId) return html.includes(`id="${justId[1]}"`);
  const clsM = last.match(/\.([\w-]+)/);
  if (clsM) return html.includes(clsM[1]!);
  const attrM = last.match(/\[([^\]="]+)="([^"]+)"\]/);
  if (attrM) return html.includes(`${attrM[1]}="${attrM[2]}"`);
  const attrOnlyM = last.match(/\[([^\]="]+)\]/);
  if (attrOnlyM) return html.includes(`${attrOnlyM[1]}=`);
  const tagM = last.match(/^([\w-]+)/);
  if (tagM) return html.toLowerCase().includes(`<${tagM[1]!.toLowerCase()}`);
  void idM;
  return html.includes(selector);
}

function countIn(html: string, selector: string): number {
  // For class-based selectors (e.g. ".product-item-link", "ol.products .product-item-link"),
  // count occurrences of the last class in the selector chain.
  const lastClass = selector.match(/\.([\w-]+)(?:[^.#\s]*)$/);
  if (lastClass) {
    const cls = lastClass[1]!;
    // Count opening tags that include this class
    const matches = html.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'g')) ?? [];
    return matches.length;
  }
  const tagM = selector.match(/^([\w-]+)/);
  if (!tagM) return selectorIn(html, selector) ? 1 : 0;
  const tag = tagM[1]!.toLowerCase();
  return (html.toLowerCase().match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
}

function extractText(html: string, selector: string): string {
  const idM = selector.match(/#([\w-]+)/);
  if (idM) {
    const m = html.match(new RegExp(`id="${idM[1]}"[^>]*>([^<]*)`, 'i'));
    if (m) return m[1]?.trim() ?? '';
  }
  return '';
}

function extractAttr(html: string, selector: string, attrName: string): string | null {
  const idM = selector.match(/#([\w-]+)/);
  if (idM) {
    const id = idM[1]!;
    const m =
      html.match(new RegExp(`id="${id}"[^>]*\\s${attrName}="([^"]*)"`, 'i')) ??
      html.match(new RegExp(`${attrName}="([^"]*)"[^>]*id="${id}"`, 'i'));
    if (m) return m[1] ?? null;
  }
  return null;
}
