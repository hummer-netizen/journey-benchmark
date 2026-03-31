import * as https from 'node:https';
import type { Page } from 'playwright';
import type { AutomationProvider } from './provider.js';
import { AutomationApi } from './automation-api.js';

/**
 * WebfuseProvider — drives browser automation via the Webfuse Session MCP Server.
 *
 * All perception (domSnapshot, accessibilityTree) and actuation (click, type, etc.)
 * go through the Automation API. No Chromium is launched.
 *
 * Env vars:
 *   WEBFUSE_API_KEY      — ak_* key for the MCP server (required)
 *   WEBFUSE_MCP_ENDPOINT — MCP server URL (default: https://session-mcp.webfu.se/mcp)
 *   WEBFUSE_SESSION_ID   — existing session ID (skip creation)
 *   WEBFUSE_SPACE_URL    — space URL for REST API session creation fallback
 */
export class WebfuseProvider implements AutomationProvider {
  private readonly apiKey: string;
  private readonly mcpEndpoint: string;
  private readonly spaceUrl: string;
  private _automationApi: AutomationApi | null = null;
  private _activeSessionId: string | null = null;

  constructor(_headless = true) {
    const apiKey = process.env['WEBFUSE_API_KEY'];
    if (!apiKey) throw new Error('WEBFUSE_API_KEY is not set — cannot use WebfuseProvider');
    this.apiKey = apiKey;
    this.mcpEndpoint = process.env['WEBFUSE_MCP_ENDPOINT'] ?? 'https://session-mcp.webfu.se/mcp';
    this.spaceUrl = process.env['WEBFUSE_SPACE_URL'] ?? 'https://webfu.se/+benchmark-webarena/';
  }

  private getApi(): AutomationApi {
    if (!this._automationApi) {
      this._automationApi = new AutomationApi({
        apiKey: this.apiKey,
        mcpEndpoint: this.mcpEndpoint,
      });
    }
    return this._automationApi;
  }

  private async resolveSessionId(): Promise<string> {
    const envSessionId = process.env['WEBFUSE_SESSION_ID'];
    if (envSessionId) {
      console.log(`  [Webfuse] Using session: ${envSessionId}`);
      return envSessionId;
    }
    const sessionId = await this.createSession();
    console.log(`  [Webfuse] Created session: ${sessionId}`);
    return sessionId;
  }

  private createSession(): Promise<string> {
    return new Promise((resolve, reject) => {
      const spaceMatch = this.spaceUrl.match(/\/\+([^/]+)/);
      const spaceKey = spaceMatch?.[1] ?? 'default';
      const body = JSON.stringify({ space: spaceKey });
      const reqOptions: https.RequestOptions = {
        hostname: 'webfu.se',
        port: 443,
        path: '/api/sessions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${this.apiKey}`,
        },
      };
      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { session_id?: string; id?: string; error?: string };
            const id = parsed.session_id ?? parsed.id;
            if (id) return resolve(id);
            reject(new Error(`Session creation failed: ${data.slice(0, 200)}`));
          } catch {
            reject(new Error(`Failed to parse session response: ${data.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Session creation timed out')); });
      req.write(body);
      req.end();
    });
  }

  async openUrl(url: string): Promise<Page> {
    const api = this.getApi();
    const sessionId = await this.resolveSessionId();
    this._activeSessionId = sessionId;

    console.log(`  [Webfuse] Navigating to: ${url}`);
    await api.navigate(sessionId, url);

    // Prime the URL cache from actual page state
    let initialUrl = url;
    try {
      const info = await api.pageInfo(sessionId);
      if (info.url) initialUrl = info.url;
    } catch { /* use requested URL */ }

    return this.createPageProxy(api, sessionId, initialUrl) as unknown as Page;
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

    // Minimal fake ElementHandle for selectors returned by $ / $$
    const makeHandle = (selector: string) => ({
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
    });

    const proxy: Record<string, unknown> = {
      // --- Navigation ---
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

      title: async () => {
        const info = await api.pageInfo(sessionId);
        return info.title;
      },

      content: () => api.domSnapshot(sessionId, { webfuseIDs: true }),

      screenshot: (_options?: Record<string, unknown>) => api.guiSnapshot(sessionId),

      // --- Actions ---
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

      check: async (selector: string, _options?: Record<string, unknown>) => {
        await api.click(sessionId, selector);
      },

      uncheck: async (selector: string, _options?: Record<string, unknown>) => {
        await api.click(sessionId, selector);
      },

      dispatchEvent: async (selector: string, type: string, _eventInit?: Record<string, unknown>) => {
        if (type === 'click') await api.click(sessionId, selector);
      },

      // --- DOM queries ---
      $: async (selector: string) => {
        const html = await api.domSnapshot(sessionId);
        return selectorIn(html, selector) ? makeHandle(selector) : null;
      },

      $$: async (selector: string) => {
        const html = await api.domSnapshot(sessionId);
        const count = countIn(html, selector);
        return Array.from({ length: count }, (_, i) =>
          makeHandle(`${selector}:nth-of-type(${i + 1})`)
        );
      },

      $eval: async (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        void fn; void args;
        const html = await api.domSnapshot(sessionId);
        return extractText(html, selector);
      },

      $$eval: async (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        void fn; void args;
        const html = await api.domSnapshot(sessionId);
        return [extractText(html, selector)];
      },

      // --- State inspection ---
      isVisible: async (selector: string, _options?: Record<string, unknown>) => {
        const html = await api.domSnapshot(sessionId);
        return selectorIn(html, selector);
      },

      isChecked: async (selector: string, _options?: Record<string, unknown>) => {
        const html = await api.domSnapshot(sessionId);
        return selectorIn(html, selector) && html.includes('checked');
      },

      textContent: async (selector: string, _options?: Record<string, unknown>) => {
        const html = await api.domSnapshot(sessionId);
        return extractText(html, selector);
      },

      // --- Evaluate (best-effort: returns domSnapshot HTML) ---
      evaluate: async (fn: ((...args: unknown[]) => unknown) | string, ...args: unknown[]) => {
        void fn; void args;
        return api.domSnapshot(sessionId);
      },

      // --- Wait helpers ---
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

      waitForLoadState: async (_state?: string, _options?: Record<string, unknown>) => {
        await api.wait(sessionId).catch(() => {});
      },

      waitForTimeout: (ms: number) => sleep(ms),

      waitForFunction: async (_fn: unknown, ..._args: unknown[]) => {
        await sleep(2000);
        return null;
      },

      // --- Locator (facade over click/fill) ---
      locator: (selector: string, _options?: Record<string, unknown>) => ({
        click: (opts?: Record<string, unknown>) => {
          void opts;
          return api.click(sessionId, selector);
        },
        fill: (value: string, opts?: Record<string, unknown>) => {
          void opts;
          return api.type(sessionId, selector, value, { overwrite: true });
        },
        type: (text: string, opts?: Record<string, unknown>) => {
          void opts;
          return api.type(sessionId, selector, text);
        },
        press: (key: string, opts?: Record<string, unknown>) => {
          void opts;
          return api.keyPress(sessionId, selector, key);
        },
        first: () => ({
          click: () => api.click(sessionId, selector),
          fill: (value: string) => api.type(sessionId, selector, value, { overwrite: true }),
        }),
        nth: (_index: number) => ({
          click: () => api.click(sessionId, selector),
          fill: (value: string) => api.type(sessionId, selector, value, { overwrite: true }),
        }),
        waitFor: async (_options?: Record<string, unknown>) => {
          const timeout = (_options?.['timeout'] as number | undefined) ?? 30000;
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const html = await api.domSnapshot(sessionId);
            if (selectorIn(html, selector)) return;
            await sleep(1000);
          }
        },
        isVisible: async () => {
          const html = await api.domSnapshot(sessionId);
          return selectorIn(html, selector);
        },
      }),

      // --- Context stub (used by some journeys) ---
      context: () => ({
        newPage: async () => proxy,
        close: async () => {},
      }),
    };

    return proxy;
  }

  /** Return the automation API instance (for agent integration) */
  getAutomationApi(): AutomationApi | null {
    return this._automationApi;
  }

  /** Return the active session ID */
  getActiveSessionId(): string | null {
    return this._activeSessionId;
  }

  async close(): Promise<void> {
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
  // #id
  const idM = selector.match(/^#([\w-]+)/);
  if (idM) return html.includes(`id="${idM[1]}"`);
  // .class
  const clsM = selector.match(/^\.([\w-]+)/);
  if (clsM) return html.toLowerCase().includes('class=') && html.includes(clsM[1]!);
  // [attr="val"]
  const attrM = selector.match(/\[([^\]="]+)="([^"]+)"\]/);
  if (attrM) return html.includes(`${attrM[1]}="${attrM[2]}"`);
  // [attr]
  const attrOnlyM = selector.match(/\[([^\]="]+)\]/);
  if (attrOnlyM) return html.includes(`${attrOnlyM[1]}=`);
  // tag
  const tagM = selector.match(/^([\w-]+)/);
  if (tagM) return html.toLowerCase().includes(`<${tagM[1]!.toLowerCase()}`);
  return html.includes(selector);
}

function countIn(html: string, selector: string): number {
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
