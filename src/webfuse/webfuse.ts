import * as https from 'node:https';
import type { Page } from 'playwright';
import type { AutomationProvider } from './provider.js';
import { AutomationApi } from './automation-api.js';

/**
 * WebfuseProvider — drives browser automation via the Webfuse Session MCP Server.
 *
 * All perception (domSnapshot, accessibilityTree) and actuation (click, type, etc.)
 * go through the Automation API. No local Chromium is used — Webfuse manages the browser.
 *
 * Session lifecycle (per journey run):
 *   1. Use WEBFUSE_SESSION_ID env var if set, otherwise create session via REST API
 *   2. Initialize MCP session (lazy, on first tool call)
 *   3. Navigate to the target journey URL via MCP navigate tool
 *   4. Run journey steps via MCP (click, type, domSnapshot, etc.)
 *   5. On close(): terminate session via DELETE REST API
 *
 * Env vars:
 *   WEBFUSE_AUTOMATION_KEY — ak_* Space Automation API key (required for Session MCP)
 *   WEBFUSE_COMPANY_KEY    — ck_* Company key (required for REST API session creation)
 *   WEBFUSE_SESSION_ID     — Pre-existing session ID (optional; skips session creation)
 *   WEBFUSE_SPACE_SLUG     — Space slug for session creation (default: webfuse-mcp-demo)
 *   WEBFUSE_MCP_ENDPOINT   — MCP server URL (default: https://session-mcp.webfu.se/mcp)
 *   WEBFUSE_REST_ENDPOINT  — REST/Docs MCP URL (default: https://mcp.webfu.se/mcp)
 */
export class WebfuseProvider implements AutomationProvider {
  private readonly apiKey: string;
  private readonly companyKey: string | null;
  private readonly spaceSlug: string;
  private readonly mcpEndpoint: string;
  private readonly restEndpoint: string;
  private _automationApi: AutomationApi | null = null;
  private _activeSessionId: string | null = null;
  private _sessionOwned = false; // true if we created the session (should terminate on close)

  constructor(_headless = true) {
    const apiKey = process.env['WEBFUSE_AUTOMATION_KEY'];
    if (!apiKey) throw new Error('WEBFUSE_AUTOMATION_KEY is not set — cannot use WebfuseProvider (Track C)');
    this.apiKey = apiKey;
    this.companyKey = process.env['WEBFUSE_COMPANY_KEY'] ?? null;
    this.spaceSlug = process.env['WEBFUSE_SPACE_SLUG'] ?? 'webfuse-mcp-demo';
    this.mcpEndpoint = process.env['WEBFUSE_MCP_ENDPOINT'] ?? 'https://session-mcp.webfu.se/mcp';
    this.restEndpoint = process.env['WEBFUSE_REST_ENDPOINT'] ?? 'https://mcp.webfu.se/mcp';
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

  /**
   * Create a Webfuse session via the REST/Docs MCP server using the api_call tool.
   * Uses operation_id "+_create" with path_params.slug = spaceSlug.
   * Returns session_id.
   */
  private async createSessionViaRestApi(): Promise<string> {
    if (!this.companyKey) {
      throw new Error('WEBFUSE_COMPANY_KEY is not set — cannot create sessions via REST API');
    }

    // Initialize a temporary MCP session with the Docs MCP server
    const initBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'journey-benchmark', version: '1.0.0' },
      },
    });

    const initResp = await this.httpPost(this.restEndpoint, initBody, {
      Authorization: `Bearer ${this.companyKey}`,
      Accept: 'application/json, text/event-stream',
    });

    // Extract Mcp-Session-Id from response headers
    const sessionIdHeader = initResp.headers['mcp-session-id'] ?? null;

    // Send initialized notification
    const notifyBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    const notifyHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.companyKey}`,
      Accept: 'application/json, text/event-stream',
    };
    if (sessionIdHeader) notifyHeaders['Mcp-Session-Id'] = sessionIdHeader;
    await this.httpPost(this.restEndpoint, notifyBody, notifyHeaders);

    // Call api_call tool to create session
    const callBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'api_call',
        arguments: {
          operation_id: '+_create',
          path_params: { slug: this.spaceSlug },
        },
      },
    });

    const callHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.companyKey}`,
      Accept: 'application/json, text/event-stream',
    };
    if (sessionIdHeader) callHeaders['Mcp-Session-Id'] = sessionIdHeader;

    const callResp = await this.httpPost(this.restEndpoint, callBody, callHeaders);
    const parsed = this.parseSseResponse(callResp.body);

    if (parsed.error) {
      throw new Error(`REST API session creation failed: ${parsed.error.message}`);
    }

    const content = parsed.result?.content ?? [];
    const text = content.filter((c: { type: string }) => c.type === 'text').map((c: { text?: string }) => c.text ?? '').join('\n');

    // Parse session_id from response text
    let sessionData: { session_id?: string; link?: string };
    try {
      sessionData = JSON.parse(text);
    } catch {
      // Try to extract from text
      const match = text.match(/session_id[:\s]+([A-Z0-9]+)/i);
      if (match) return match[1]!;
      throw new Error(`Failed to parse session creation response: ${text.slice(0, 300)}`);
    }

    if (!sessionData.session_id) {
      throw new Error(`No session_id in REST API response: ${text.slice(0, 300)}`);
    }

    return sessionData.session_id;
  }

  /** Obtain a session ID — from env var or by creating one via REST API */
  private async obtainSessionId(): Promise<string> {
    const envSessionId = process.env['WEBFUSE_SESSION_ID'];
    if (envSessionId) {
      console.log(`  [Webfuse] Using pre-existing session: ${envSessionId}`);
      this._sessionOwned = false;
      return envSessionId;
    }

    console.log(`  [Webfuse] Creating session via REST API (space: ${this.spaceSlug})`);
    const sessionId = await this.createSessionViaRestApi();
    console.log(`  [Webfuse] Session created: ${sessionId}`);
    this._sessionOwned = true;
    return sessionId;
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
    // Step 1: Obtain session ID (env var or REST API creation)
    const sessionId = await this.obtainSessionId();
    this._activeSessionId = sessionId;

    // Step 2: Get automation API
    const api = this.getApi();

    // Step 3: Verify session is active via page_info
    try {
      const info = await api.pageInfo(sessionId);
      console.log(`  [Webfuse] Session active. Current URL: ${info.url}`);
    } catch (e) {
      console.warn(`  [Webfuse] Session check: ${e instanceof Error ? e.message : e}`);
    }

    // Step 4: Navigate to the target URL
    console.log(`  [Webfuse] Navigating to: ${url}`);
    await api.navigate(sessionId, "about:blank"); await sleep(2000); await api.navigate(sessionId, url); await sleep(3000);

    // Verify navigation
    let confirmedUrl = url;
    try {
      const info = await api.pageInfo(sessionId);
      if (info.url) confirmedUrl = info.url;
      console.log(`  [Webfuse] Navigated to: ${confirmedUrl}`);
    } catch { /* use requested URL */ }

    return this.createPageProxy(api, sessionId, confirmedUrl) as unknown as Page;
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

    /** Get domSnapshot with wf-ids enabled and find element by wf-id or CSS selector */
    const getDomWithWfIds = async (): Promise<string> => {
      return api.domSnapshot(sessionId, { webfuseIDs: true });
    };

    /** Resolve a CSS selector to a wf-id target if possible, otherwise return CSS selector */
    const resolveTarget = async (selector: string): Promise<string> => {
      try {
        const dom = await getDomWithWfIds();
        const wfId = findWfIdForSelector(dom, selector);
        if (wfId) return `[wf-id="${wfId}"]`;
      } catch { /* fallback to CSS selector */ }
      return selector;
    };

    const makeHandle = (selector: string): Record<string, unknown> => ({
      click: async () => {
        const target = await resolveTarget(selector);
        return api.click(sessionId, target);
      },
      fill: async (value: string) => {
        const target = await resolveTarget(selector);
        await api.type(sessionId, target, value, { overwrite: true });
        // Press Tab to trigger change/blur events
        await api.keyPress(sessionId, target, 'Tab');
        await sleep(300);
      },
      type: async (text: string) => {
        const target = await resolveTarget(selector);
        return api.type(sessionId, target, text);
      },
      press: async (key: string) => {
        const target = await resolveTarget(selector);
        return api.keyPress(sessionId, target, key);
      },
      textContent: async () => {
        const dom = await getDomWithWfIds();
        return extractText(dom, selector);
      },
      getAttribute: async (name: string) => {
        const dom = await getDomWithWfIds();
        return extractAttr(dom, selector, name);
      },
      isVisible: async () => {
        const dom = await getDomWithWfIds();
        return selectorIn(dom, selector);
      },
      evaluate: async (_fn: unknown) => null,
      $$: async (childSelector: string) => {
        const dom = await getDomWithWfIds();
        const count = countIn(dom, childSelector);
        return Array.from({ length: count }, (_, i) => makeHandle(`${childSelector}:nth-of-type(${i + 1})`));
      },
      $: async (childSelector: string) => {
        const dom = await getDomWithWfIds();
        return selectorIn(dom, childSelector) ? makeHandle(childSelector) : null;
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

      click: async (selector: string, options?: Record<string, unknown>) => {
        const target = await resolveTarget(selector);
        const clickOpts: Record<string, unknown> = {};
        if (options?.['button'] === 'right') clickOpts['button'] = 'right';
        console.log(`  [Webfuse/click] ${selector} → target: ${target}${clickOpts['button'] ? ' (right)' : ''}`);
        await api.click(sessionId, target, Object.keys(clickOpts).length > 0 ? clickOpts : undefined);
        await sleep(500);
      },
      fill: async (selector: string, value: string, _options?: Record<string, unknown>) => {
        const target = await resolveTarget(selector);
        await api.click(sessionId, target);
        await sleep(500);

        // Detect date inputs and convert ISO format to keyboard entry format
        // type=date inputs expect keyboard entry as MMDDYYYY (US) without separators
        const isDateInput = await (async () => {
          try {
            const dom = await getDomWithWfIds();
            // Check if the specific element has type="date" (match the element tag, not just anywhere in DOM)
            const selectorId = selector.match(/#([\w-]+)/)?.[1];
            if (selectorId) {
              // Match the actual input element with both this id AND type="date"
              const elementRegex = new RegExp(`<input[^>]*id="${selectorId}"[^>]*type="date"[^>]*>|<input[^>]*type="date"[^>]*id="${selectorId}"[^>]*>`);
              return elementRegex.test(dom);
            }
            return false;
          } catch { return false; }
        })();

        if (isDateInput && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          // For date inputs: type each segment (MM, DD, YYYY) with Tab between them
          // This works with Chrome's segmented date input fields
          const [yyyy, mm, dd] = value.split('-');
          console.log(`  [Webfuse/fill] Date input detected, entering: ${mm}/${dd}/${yyyy}`);
          // Click to focus and position cursor at month segment
          await api.click(sessionId, target);
          await sleep(300);
          // Select all to clear existing value
          await api.keyPress(sessionId, target, 'Control+a');
          await sleep(200);
          // Type the full date as MMDDYYYY — Chrome's date input auto-advances segments
          const dateStr = `${mm}${dd}${yyyy}`;
          await api.type(sessionId, target, dateStr, { overwrite: false });
          await sleep(300);
          // Tab out to trigger change/blur events
          await api.keyPress(sessionId, target, 'Tab');
        } else {
          await api.type(sessionId, target, value, { overwrite: true });
          // Press Tab after fill to trigger change/blur events
          await api.keyPress(sessionId, target, 'Tab');
        }
        await sleep(300);
      },
      type: async (selector: string, text: string, _options?: Record<string, unknown>) => {
        const target = await resolveTarget(selector);
        await api.type(sessionId, target, text, { overwrite: false });
      },
      press: async (selector: string, key: string, _options?: Record<string, unknown>) => {
        const target = await resolveTarget(selector);
        await api.keyPress(sessionId, target, key);
        await sleep(300);
      },
      selectOption: async (selector: string, values: unknown, _options?: Record<string, unknown>) => {
        // Always pass option value attribute, not display text
        const value = Array.isArray(values)
          ? (typeof values[0] === 'object' && values[0] !== null && 'value' in (values[0] as object)
              ? (values[0] as { value: string }).value
              : (values[0] as string))
          : (typeof values === 'object' && values !== null && 'value' in (values as object)
              ? (values as { value: string }).value
              : (values as string));
        const target = await resolveTarget(selector);
        await api.select(sessionId, target, value);
        return [];
      },
      check: async (selector: string) => {
        const target = await resolveTarget(selector);
        await api.click(sessionId, target);
      },
      uncheck: async (selector: string) => {
        const target = await resolveTarget(selector);
        await api.click(sessionId, target);
      },
      dispatchEvent: async (selector: string, type: string) => {
        const target = await resolveTarget(selector);
        if (type === 'click') {
          await api.click(sessionId, target);
        } else if (type === 'change' || type === 'input' || type === 'blur') {
          // Trigger change/input by clicking the element and pressing Tab to blur
          await api.click(sessionId, target);
          await sleep(200);
          await api.keyPress(sessionId, target, 'Tab');
          await sleep(200);
        }
      },

      $: async (selector: string) => {
        const dom = await getDomWithWfIds();
        return selectorIn(dom, selector) ? makeHandle(selector) : null;
      },
      $$: async (selector: string) => {
        const dom = await getDomWithWfIds();
        const count = countIn(dom, selector);
        return Array.from({ length: count }, (_, i) => makeHandle(`${selector}:nth-of-type(${i + 1})`));
      },
      $eval: async (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        const dom = await getDomWithWfIds();
        // Try to evaluate common patterns by inspecting the function source
        const fnStr = fn.toString();
        // classList.contains('X') pattern
        const classMatch = fnStr.match(/classList\.contains\(['"]([^'"]+)['"]\)/);
        if (classMatch) {
          const cls = classMatch[1]!;
          // Check if the element matching selector has the class
          const idM = selector.match(/#([\w-]+)/);
          if (idM) {
            const pattern = new RegExp(`id="${idM[1]}"[^>]*class="[^"]*\\b${cls}\\b`, 'i');
            const pattern2 = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*id="${idM[1]}"`, 'i');
            return pattern.test(dom) || pattern2.test(dom);
          }
          return dom.includes(`class="`) && new RegExp(`\\b${cls}\\b`).test(dom);
        }
        void args;
        return extractText(dom, selector);
      },
      $$eval: async (selector: string, fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        void fn; void args;
        return [extractText(await getDomWithWfIds(), selector)];
      },

      isVisible: async (selector: string) => selectorIn(await getDomWithWfIds(), selector),
      isChecked: async (selector: string) => {
        const dom = await getDomWithWfIds();
        return selectorIn(dom, selector) && dom.includes('checked');
      },
      textContent: async (selector: string) => extractText(await getDomWithWfIds(), selector),
      evaluate: async (fn: unknown, ...args: unknown[]) => { void fn; void args; return api.domSnapshot(sessionId, { webfuseIDs: true }); },

      waitForSelector: async (selector: string, options?: Record<string, unknown>) => {
        const timeout = (options?.['timeout'] as number | undefined) ?? 30000;
        const deadline = Date.now() + timeout;
        let polls = 0;
        // First check immediately
        try {
          const dom = await getDomWithWfIds();
          polls++;
          if (selectorIn(dom, selector)) return makeHandle(selector);
          // Debug: show nearby DOM for the selector being waited on
          const idM = selector.match(/#([\w-]+)/);
          if (idM) {
            const idx = dom.indexOf(`id="${idM[1]}"`);
            if (idx >= 0) console.log(`  [waitForSelector] ${selector} poll#${polls}: tag=${dom.substring(idx-5, idx+80)}`);
          }
        } catch { /* retry */ }
        // Then poll with shorter intervals
        while (Date.now() < deadline) {
          await sleep(500);
          try {
            const dom = await getDomWithWfIds();
            polls++;
            if (selectorIn(dom, selector)) return makeHandle(selector);
            if (polls <= 3) {
              const idM = selector.match(/#([\w-]+)/);
              if (idM) {
                const idx = dom.indexOf(`id="${idM[1]}"`);
                if (idx >= 0) console.log(`  [waitForSelector] ${selector} poll#${polls}: tag=${dom.substring(idx-5, idx+80)}`);
              }
            }
          } catch { /* retry */ }
        }
        console.log(`  [waitForSelector] TIMEOUT ${selector} after ${polls} polls`);
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
        click: async () => {
          const target = await resolveTarget(selector);
          return api.click(sessionId, target);
        },
        fill: async (value: string) => {
          const target = await resolveTarget(selector);
          return api.type(sessionId, target, value, { overwrite: true });
        },
        type: async (text: string) => {
          const target = await resolveTarget(selector);
          return api.type(sessionId, target, text);
        },
        press: async (key: string) => {
          const target = await resolveTarget(selector);
          return api.keyPress(sessionId, target, key);
        },
        first: () => ({
          click: async () => {
            const target = await resolveTarget(selector);
            return api.click(sessionId, target);
          },
          fill: async (value: string) => {
            const target = await resolveTarget(selector);
            return api.type(sessionId, target, value, { overwrite: true });
          },
        }),
        nth: (_index: number) => ({
          click: async () => {
            const target = await resolveTarget(selector);
            return api.click(sessionId, target);
          },
          fill: async (value: string) => {
            const target = await resolveTarget(selector);
            return api.type(sessionId, target, value, { overwrite: true });
          },
        }),
        waitFor: async (options?: Record<string, unknown>) => {
          const timeout = (options?.['timeout'] as number | undefined) ?? 30000;
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const dom = await getDomWithWfIds();
            if (selectorIn(dom, selector)) return;
            await sleep(1000);
          }
        },
        isVisible: async () => selectorIn(await getDomWithWfIds(), selector),
      }),

      context: () => ({ newPage: async () => proxy, close: async () => {} }),
    };

    return proxy;
  }

  getAutomationApi(): AutomationApi | null { return this._automationApi; }
  getActiveSessionId(): string | null { return this._activeSessionId; }

  async close(): Promise<void> {
    // Only terminate sessions we created
    if (this._activeSessionId && this._sessionOwned) {
      console.log(`  [Webfuse] Terminating session: ${this._activeSessionId}`);
      await this.terminateSession(this._activeSessionId);
    }
    // Log audit summary
    if (this._automationApi) {
      const log = this._automationApi.auditLog;
      if (log.length > 0) {
        console.log(`  [Webfuse] Session closed. Audit log: ${log.length} tool calls`);
      }
    }
    this._automationApi = null;
    this._activeSessionId = null;
    this._sessionOwned = false;
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers for REST API communication
  // ---------------------------------------------------------------------------

  private httpPost(url: string, body: string, headers: Record<string, string>): Promise<{ body: string; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const reqOptions: https.RequestOptions = {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      };
      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({
          body: data,
          headers: res.headers as Record<string, string>,
        }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('REST API request timed out'));
      });
      req.write(body);
      req.end();
    });
  }

  private parseSseResponse(raw: string): { result?: { content: Array<{ type: string; text?: string }> }; error?: { code: number; message: string } } {
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        const json = line.slice(6).trim();
        try { return JSON.parse(json); } catch { /* next line */ }
      }
    }
    try { return JSON.parse(raw); } catch {
      throw new Error(`Failed to parse REST API response: ${raw.slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// DOM helpers — regex-based for wf-id extraction and CSS selector fallback
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Try to find a wf-id attribute for an element matching the CSS selector in the DOM snapshot */
function findWfIdForSelector(dom: string, selector: string): string | null {
  // Handle ID selectors: #foo → id="foo" → find wf-id on same element
  const idMatch = selector.match(/^#([\w-]+)$/);
  if (idMatch) {
    const pattern = new RegExp(`<[^>]*\\bid="${idMatch[1]}"[^>]*\\bwf-id="([^"]+)"`, 'i');
    const m = dom.match(pattern);
    if (m) return m[1]!;
    // Try reverse order
    const pattern2 = new RegExp(`<[^>]*\\bwf-id="([^"]+)"[^>]*\\bid="${idMatch[1]}"`, 'i');
    const m2 = dom.match(pattern2);
    if (m2) return m2[1]!;
  }

  // Handle name attribute selectors: [name="foo"]
  const nameMatch = selector.match(/\[name="([^"]+)"\]/);
  if (nameMatch) {
    const pattern = new RegExp(`<[^>]*\\bname="${nameMatch[1]}"[^>]*\\bwf-id="([^"]+)"`, 'i');
    const m = dom.match(pattern);
    if (m) return m[1]!;
    const pattern2 = new RegExp(`<[^>]*\\bwf-id="([^"]+)"[^>]*\\bname="${nameMatch[1]}"`, 'i');
    const m2 = dom.match(pattern2);
    if (m2) return m2[1]!;
  }

  // Handle type+class selectors: input.email, button.submit
  const tagClassMatch = selector.match(/^(\w+)\.([\w-]+)$/);
  if (tagClassMatch) {
    const [, tag, cls] = tagClassMatch;
    const pattern = new RegExp(`<${tag}[^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*\\bwf-id="([^"]+)"`, 'i');
    const m = dom.match(pattern);
    if (m) return m[1]!;
    const pattern2 = new RegExp(`<${tag}[^>]*\\bwf-id="([^"]+)"[^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"`, 'i');
    const m2 = dom.match(pattern2);
    if (m2) return m2[1]!;
  }

  // Handle class-only selectors: .foo
  const classMatch = selector.match(/^\.([\w-]+)$/);
  if (classMatch) {
    const pattern = new RegExp(`<[^>]*\\bclass="[^"]*\\b${classMatch[1]}\\b[^"]*"[^>]*\\bwf-id="([^"]+)"`, 'i');
    const m = dom.match(pattern);
    if (m) return m[1]!;
    const pattern2 = new RegExp(`<[^>]*\\bwf-id="([^"]+)"[^>]*\\bclass="[^"]*\\b${classMatch[1]}\\b[^"]*"`, 'i');
    const m2 = dom.match(pattern2);
    if (m2) return m2[1]!;
  }

  return null;
}

function selectorIn(html: string, selector: string): boolean {
  if (selector.includes(',')) {
    return selector.split(',').some(s => selectorIn(html, s.trim()));
  }
  const clean = selector.replace(/:[a-z-]+(\([^)]*\))?/g, '').trim();
  const parts = clean.split(/\s+/);
  const last = parts[parts.length - 1] ?? clean;

  // Handle compound selectors like #id.class — check both parts
  const idMatch = last.match(/^#([\w-]+)/);
  const classMatches = [...last.matchAll(/\.([\w-]+)/g)].map(m => m[1]!);

  if (idMatch && classMatches.length > 0) {
    // Compound: must find element with both id and all classes
    const id = idMatch[1]!;
    // Find the tag containing this id
    const tagPattern = new RegExp(`<[^>]*id="${id}"[^>]*>`, 'i');
    const tagMatch = html.match(tagPattern);
    if (!tagMatch) return false;
    const tag = tagMatch[0];
    // Check all required classes are present in the tag's class attribute
    return classMatches.every(cls => {
      const clsRegex = new RegExp(`class="[^"]*\\b${cls}\\b`, 'i');
      return clsRegex.test(tag);
    });
  }

  if (idMatch) return html.includes(`id="${idMatch[1]}"`);
  const clsM = last.match(/\.([\w-]+)/);
  if (clsM) return html.includes(clsM[1]!);
  const attrM = last.match(/\[([^\]="]+)="([^"]+)"\]/);
  if (attrM) return html.includes(`${attrM[1]}="${attrM[2]}"`);
  const attrOnlyM = last.match(/\[([^\]="]+)\]/);
  if (attrOnlyM) return html.includes(`${attrOnlyM[1]}=`);
  const tagM = last.match(/^([\w-]+)/);
  if (tagM) return html.toLowerCase().includes(`<${tagM[1]!.toLowerCase()}`);
  return html.includes(selector);
}

function countIn(html: string, selector: string): number {
  const lastClass = selector.match(/\.([\w-]+)(?:[^.#\s]*)$/);
  if (lastClass) {
    const cls = lastClass[1]!;
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
