import * as https from 'node:https';
import * as http from 'node:http';

/**
 * TypeScript client for the Webfuse Session MCP Server.
 *
 * Sends JSON-RPC tool calls to the MCP endpoint authenticated with an ak_* key.
 * All page interaction (perception + actuation) goes through this client.
 *
 * MCP session lifecycle:
 *   1. POST /mcp with initialize → server returns Mcp-Session-Id header
 *   2. POST /mcp with notifications/initialized (include Mcp-Session-Id header)
 *   3. All subsequent requests include Mcp-Session-Id header
 *
 * Responses are SSE-formatted:
 *   event: message
 *   data: {"jsonrpc":"2.0","id":1,"result":{...}}
 *
 * Env vars:
 *   WEBFUSE_API_KEY      — ak_* Bearer token
 *   WEBFUSE_MCP_ENDPOINT — MCP server URL (default: https://session-mcp.webfu.se/mcp)
 */

export interface AutomationApiOptions {
  apiKey: string;
  mcpEndpoint?: string;
  timeout?: number;
}

interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }>;
  };
  error?: { code: number; message: string };
}

export interface AuditEntry {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: number;
}

export class AutomationApi {
  private readonly apiKey: string;
  readonly mcpEndpoint: string;
  private readonly timeout: number;
  private callCounter = 0;
  private readonly _auditLog: AuditEntry[] = [];
  private _mcpSessionId: string | null = null;
  private _initialized = false;

  constructor(options: AutomationApiOptions) {
    this.apiKey = options.apiKey;
    this.mcpEndpoint = options.mcpEndpoint ?? 'https://session-mcp.webfu.se/mcp';
    this.timeout = options.timeout ?? 15000;
  }

  /** Low-level HTTP POST returning body only — overrideable in tests via subclass */
  protected post(url: string, body: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = (parsed.protocol === 'https:' ? https : http) as unknown as typeof https;
      const reqOptions: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      };
      const req = lib.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject(new Error(`MCP request timed out after ${this.timeout}ms`));
      });
      req.write(body);
      req.end();
    });
  }

  /** Low-level HTTP POST returning body + response headers — overrideable in tests */
  protected postFull(url: string, body: string, headers: Record<string, string>): Promise<{ body: string; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = (parsed.protocol === 'https:' ? https : http) as unknown as typeof https;
      const reqOptions: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      };
      const req = lib.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({
          body: data,
          headers: res.headers as Record<string, string>,
        }));
      });
      req.on('error', reject);
      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject(new Error(`MCP init request timed out after ${this.timeout}ms`));
      });
      req.write(body);
      req.end();
    });
  }

  /** Parse SSE-formatted MCP response, extracting JSON from "data: {...}" lines.
   *  Falls back to plain JSON parse for non-SSE responses (e.g. test mocks). */
  private parseSseData(raw: string): McpResponse {
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        const json = line.slice(6).trim();
        try {
          return JSON.parse(json) as McpResponse;
        } catch {
          // not valid JSON, try next line
        }
      }
    }
    // Fallback: try plain JSON (for non-SSE responses or test mocks)
    try {
      return JSON.parse(raw) as McpResponse;
    } catch {
      throw new Error(`Failed to parse MCP response: ${raw.slice(0, 200)}`);
    }
  }

  /** Lazy MCP session initialization — called once before the first tool call.
   *  1. POST initialize → capture Mcp-Session-Id from response header
   *  2. POST notifications/initialized with session header
   */
  private async ensureInitialized(): Promise<void> {
    if (this._initialized) return;

    // Step 1: initialize
    const initBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'journey-benchmark', version: '1.0.0' },
      },
    });

    const initResp = await this.postFull(this.mcpEndpoint, initBody, {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json, text/event-stream',
    });

    const sessionId = initResp.headers['mcp-session-id'];
    if (sessionId) {
      this._mcpSessionId = sessionId;
    }

    // Step 2: notifications/initialized
    const notifyBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    const notifyHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json, text/event-stream',
    };
    if (this._mcpSessionId) {
      notifyHeaders['Mcp-Session-Id'] = this._mcpSessionId;
    }
    await this.postFull(this.mcpEndpoint, notifyBody, notifyHeaders);

    this._initialized = true;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureInitialized();

    const id = ++this.callCounter;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    });

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json, text/event-stream',
    };
    if (this._mcpSessionId) {
      headers['Mcp-Session-Id'] = this._mcpSessionId;
    }

    const raw = await this.post(this.mcpEndpoint, body, headers);

    let parsed: McpResponse;
    try {
      parsed = this.parseSseData(raw);
    } catch {
      throw new Error(`Failed to parse MCP response for [${name}]: ${raw.slice(0, 200)}`);
    }

    if (parsed.error) {
      throw new Error(`MCP tool error [${name}]: ${parsed.error.message}`);
    }

    const content = parsed.result?.content ?? [];
    const text = content
      .filter(c => c.type === 'text')
      .map(c => c.text ?? '')
      .join('\n');

    this._auditLog.push({ tool: name, args, result: text.slice(0, 500), timestamp: Date.now() });
    return text;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigate(sessionId: string, url: string): Promise<string> {
    return this.callTool('navigate', { session_id: sessionId, url });
  }

  // ---------------------------------------------------------------------------
  // Actuation
  // ---------------------------------------------------------------------------

  async click(sessionId: string, target: string, options?: Record<string, unknown>): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId, target };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('act_click', args);
  }

  async type(sessionId: string, target: string, text: string, options?: { overwrite?: boolean }): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId, target, text };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('act_type', args);
  }

  async keyPress(sessionId: string, target: string, key: string, options?: Record<string, unknown>): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId, target, key };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('act_keyPress', args);
  }

  async scroll(sessionId: string, target: string, amount: number, options?: Record<string, unknown>): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId, target, amount };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('act_scroll', args);
  }

  async mouseMove(sessionId: string, target: string, options?: Record<string, unknown>): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId, target };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('act_mouseMove', args);
  }

  async select(sessionId: string, target: string, value: string, options?: Record<string, unknown>): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId, target, value };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('act_select', args);
  }

  // ---------------------------------------------------------------------------
  // Perception
  // ---------------------------------------------------------------------------

  async domSnapshot(sessionId: string, options?: { webfuseIDs?: boolean }): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('see_domSnapshot', args);
  }

  async guiSnapshot(sessionId: string): Promise<Buffer> {
    await this.ensureInitialized();

    const id = ++this.callCounter;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'see_guiSnapshot', arguments: { session_id: sessionId } },
    });

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this._mcpSessionId) {
      headers['Mcp-Session-Id'] = this._mcpSessionId;
    }

    const raw = await this.post(this.mcpEndpoint, body, headers);
    let parsed: McpResponse;
    try { parsed = this.parseSseData(raw); } catch {
      throw new Error(`Failed to parse guiSnapshot response: ${raw.slice(0, 200)}`);
    }
    if (parsed.error) throw new Error(`MCP tool error [see_guiSnapshot]: ${parsed.error.message}`);
    const content = parsed.result?.content ?? [];
    for (const c of content) {
      if (c.type === 'image' && c.data) {
        this._auditLog.push({ tool: 'see_guiSnapshot', args: { session_id: sessionId }, result: '[image]', timestamp: Date.now() });
        return Buffer.from(c.data, 'base64');
      }
    }
    // Fallback: text might be a base64 string or URL
    const text = content.find(c => c.type === 'text')?.text ?? '';
    this._auditLog.push({ tool: 'see_guiSnapshot', args: { session_id: sessionId }, result: text.slice(0, 50), timestamp: Date.now() });
    return text ? Buffer.from(text, 'base64') : Buffer.alloc(0);
  }

  async accessibilityTree(sessionId: string, options?: Record<string, unknown>): Promise<string> {
    const args: Record<string, unknown> = { session_id: sessionId };
    if (options && Object.keys(options).length > 0) args['options'] = options;
    return this.callTool('see_accessibilityTree', args);
  }

  async textSelection(sessionId: string): Promise<string> {
    return this.callTool('see_textSelection', { session_id: sessionId });
  }

  // ---------------------------------------------------------------------------
  // Info / Wait
  // ---------------------------------------------------------------------------

  async pageInfo(sessionId: string): Promise<{ url: string; title: string }> {
    const text = await this.callTool('page_info', { session_id: sessionId });
    try {
      return JSON.parse(text) as { url: string; title: string };
    } catch {
      const urlMatch = text.match(/url[:\s]+([^\s\n]+)/i);
      const titleMatch = text.match(/title[:\s]+(.+?)(\n|$)/i);
      return {
        url: urlMatch?.[1]?.trim() ?? '',
        title: titleMatch?.[1]?.trim() ?? '',
      };
    }
  }

  async wait(sessionId: string): Promise<string> {
    return this.callTool('wait', { session_id: sessionId });
  }

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  get auditLog(): AuditEntry[] {
    return [...this._auditLog];
  }
}
