import { describe, it, expect, beforeEach } from 'vitest';
import { AutomationApi } from '../webfuse/automation-api.js';

// ---------------------------------------------------------------------------
// Testable subclass that overrides the HTTP layer
// ---------------------------------------------------------------------------

type MockResponse =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string }
  | { type: 'error'; message: string };

class TestApi extends AutomationApi {
  calls: Array<{ url: string; body: string }> = [];
  private responses: MockResponse[] = [];

  queueResponse(r: MockResponse) {
    this.responses.push(r);
  }

  protected override post(url: string, body: string, _headers: Record<string, string>): Promise<string> {
    this.calls.push({ url, body });
    const req = JSON.parse(body) as { id: number };
    const mock = this.responses.shift();

    if (!mock) {
      // Default: return OK text
      return Promise.resolve(JSON.stringify({
        jsonrpc: '2.0', id: req.id,
        result: { content: [{ type: 'text', text: 'OK' }] },
      }));
    }

    if (mock.type === 'error') {
      return Promise.resolve(JSON.stringify({
        jsonrpc: '2.0', id: req.id,
        error: { code: -32000, message: mock.message },
      }));
    }

    if (mock.type === 'image') {
      return Promise.resolve(JSON.stringify({
        jsonrpc: '2.0', id: req.id,
        result: { content: [{ type: 'image', data: mock.data, mimeType: 'image/png' }] },
      }));
    }

    return Promise.resolve(JSON.stringify({
      jsonrpc: '2.0', id: req.id,
      result: { content: [{ type: 'text', text: mock.text }] },
    }));
  }
}

describe('AutomationApi', () => {
  let api: TestApi;

  beforeEach(() => {
    api = new TestApi({ apiKey: 'ak_test', mcpEndpoint: 'https://session-mcp.webfu.se/mcp' });
  });

  it('sends correct JSON-RPC format for navigate', async () => {
    await api.navigate('sABC123', 'https://example.com/');
    expect(api.calls).toHaveLength(1);
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    expect(req['jsonrpc']).toBe('2.0');
    expect(req['method']).toBe('tools/call');
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('navigate');
    const args = params['arguments'] as Record<string, unknown>;
    expect(args['session_id']).toBe('sABC123');
    expect(args['url']).toBe('https://example.com/');
  });

  it('sends act_click with target', async () => {
    await api.click('sABC123', '#submit-btn');
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('act_click');
    const args = params['arguments'] as Record<string, unknown>;
    expect(args['target']).toBe('#submit-btn');
  });

  it('sends act_type with overwrite option', async () => {
    await api.type('sABC123', '#email', 'test@example.com', { overwrite: true });
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('act_type');
    const args = params['arguments'] as Record<string, unknown>;
    expect(args['text']).toBe('test@example.com');
    expect(args['overwrite']).toBe(true);
  });

  it('sends act_keyPress', async () => {
    await api.keyPress('sABC123', '#search', 'Enter');
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('act_keyPress');
    const args = params['arguments'] as Record<string, unknown>;
    expect(args['key']).toBe('Enter');
  });

  it('sends act_scroll with amount', async () => {
    await api.scroll('sABC123', 'body', 400);
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('act_scroll');
    const args = params['arguments'] as Record<string, unknown>;
    expect(args['amount']).toBe(400);
    expect(args['target']).toBe('body');
  });

  it('sends see_domSnapshot with webfuseIDs option', async () => {
    await api.domSnapshot('sABC123', { webfuseIDs: true });
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('see_domSnapshot');
    const args = params['arguments'] as Record<string, unknown>;
    expect(args['webfuseIDs']).toBe(true);
  });

  it('parses pageInfo JSON response', async () => {
    api.queueResponse({ type: 'text', text: '{"url":"https://example.com/","title":"Example"}' });
    const info = await api.pageInfo('sABC123');
    expect(info.url).toBe('https://example.com/');
    expect(info.title).toBe('Example');
  });

  it('parses pageInfo plain-text response (fallback)', async () => {
    api.queueResponse({ type: 'text', text: 'URL: https://foo.com/bar\nTitle: Foo Page' });
    const info = await api.pageInfo('sABC123');
    expect(info.url).toBe('https://foo.com/bar');
    expect(info.title).toBe('Foo Page');
  });

  it('returns Buffer from guiSnapshot image content', async () => {
    api.queueResponse({ type: 'image', data: Buffer.from('img').toString('base64') });
    const buf = await api.guiSnapshot('sABC123');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('img');
  });

  it('appends to audit log on each tool call', async () => {
    await api.navigate('sABC123', 'https://example.com/');
    await api.click('sABC123', '#btn');
    expect(api.auditLog).toHaveLength(2);
    expect(api.auditLog[0]!.tool).toBe('navigate');
    expect(api.auditLog[1]!.tool).toBe('act_click');
  });

  it('throws on MCP error response', async () => {
    api.queueResponse({ type: 'error', message: 'Session not found' });
    await expect(api.navigate('bad_session', 'https://x.com')).rejects.toThrow('Session not found');
  });

  it('sends act_select with value', async () => {
    await api.select('sABC123', '#country', 'US');
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('act_select');
    const args = params['arguments'] as Record<string, unknown>;
    expect(args['value']).toBe('US');
  });

  it('sends see_accessibilityTree', async () => {
    api.queueResponse({ type: 'text', text: '{"tree":[]}' });
    const result = await api.accessibilityTree('sABC123');
    expect(result).toBe('{"tree":[]}');
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('see_accessibilityTree');
  });

  it('sends wait tool call', async () => {
    await api.wait('sABC123');
    const req = JSON.parse(api.calls[0]!.body) as Record<string, unknown>;
    const params = req['params'] as Record<string, unknown>;
    expect(params['name']).toBe('wait');
  });

  it('auditLog returns a copy (not the internal array)', async () => {
    await api.navigate('sABC123', 'https://example.com/');
    const log1 = api.auditLog;
    await api.click('sABC123', '#btn');
    const log2 = api.auditLog;
    expect(log1).toHaveLength(1);
    expect(log2).toHaveLength(2);
  });
});
