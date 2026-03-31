import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock AutomationApi at module level so WebfuseProvider uses the mock
// ---------------------------------------------------------------------------

const mockApiInstance = {
  navigate: vi.fn().mockResolvedValue('Navigated'),
  click: vi.fn().mockResolvedValue('Clicked'),
  type: vi.fn().mockResolvedValue('Typed'),
  keyPress: vi.fn().mockResolvedValue('Key pressed'),
  scroll: vi.fn().mockResolvedValue('Scrolled'),
  select: vi.fn().mockResolvedValue('Selected'),
  mouseMove: vi.fn().mockResolvedValue('Moved'),
  domSnapshot: vi.fn().mockResolvedValue('<html><body><button id="btn">Click me</button><input id="email" /></body></html>'),
  guiSnapshot: vi.fn().mockResolvedValue(Buffer.from('screenshot')),
  accessibilityTree: vi.fn().mockResolvedValue('{"title":"Test","elements":[]}'),
  pageInfo: vi.fn().mockResolvedValue({ url: 'https://example.com/page', title: 'Test Page' }),
  wait: vi.fn().mockResolvedValue('Waited'),
  get auditLog() { return []; },
};

vi.mock('../webfuse/automation-api.js', () => ({
  AutomationApi: vi.fn().mockImplementation(() => mockApiInstance),
}));

// ---------------------------------------------------------------------------
// Mock the WebfuseProvider's private methods for session creation and browser
// so tests don't need real Webfuse credentials or Chromium
// ---------------------------------------------------------------------------

// We patch these after import via prototype spies (cast to bypass private access in tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patchProviderForTest(provider: any) {
  const proto = Object.getPrototypeOf(provider) as Record<string, unknown>;
  proto.createSession = vi.fn().mockResolvedValue({ session_id: 'sTestSession123', link: 'https://webfu.se/sTestSession123' });
  proto.openSessionInBrowser = vi.fn().mockResolvedValue(undefined);
  proto.terminateSession = vi.fn().mockResolvedValue(undefined);
}

describe('WebfuseProvider', () => {
  const origEnv = process.env;

  beforeEach(() => {
    // New env: WEBFUSE_AUTOMATION_KEY (ak_*) replaces WEBFUSE_API_KEY + WEBFUSE_SESSION_ID
    process.env = { ...origEnv, WEBFUSE_AUTOMATION_KEY: 'ak_test_key' };
    vi.clearAllMocks();
    mockApiInstance.navigate.mockResolvedValue('Navigated');
    mockApiInstance.pageInfo.mockResolvedValue({ url: 'https://example.com/page', title: 'Test Page' });
    mockApiInstance.domSnapshot.mockResolvedValue('<html><body><button id="btn">Click me</button><input id="email" /></body></html>');
    mockApiInstance.click.mockResolvedValue('Clicked');
    mockApiInstance.type.mockResolvedValue('Typed');
    mockApiInstance.keyPress.mockResolvedValue('Key pressed');
    mockApiInstance.select.mockResolvedValue('Selected');
    mockApiInstance.wait.mockResolvedValue('Waited');
    mockApiInstance.guiSnapshot.mockResolvedValue(Buffer.from('screenshot'));
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('openUrl creates a session and navigates to the given URL', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    await provider.openUrl('https://example.com/shop');
    expect(mockApiInstance.navigate).toHaveBeenCalledWith('sTestSession123', 'https://example.com/shop');
    await provider.close();
  });

  it('session_id comes from createSession (not env)', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    await provider.openUrl('https://example.com/');
    // createSession is called, session_id sTestSession123 used
    expect(mockApiInstance.navigate).toHaveBeenCalledWith('sTestSession123', 'https://example.com/');
    await provider.close();
  });

  it('throws if WEBFUSE_AUTOMATION_KEY not set', async () => {
    delete process.env['WEBFUSE_AUTOMATION_KEY'];
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    expect(() => new WebfuseProvider()).toThrow('WEBFUSE_AUTOMATION_KEY is not set');
  });

  it('page.url() returns cached URL from pageInfo', async () => {
    mockApiInstance.pageInfo.mockResolvedValue({ url: 'https://example.com/page', title: 'Test Page' });
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/page');
    expect(page.url()).toBe('https://example.com/page');
    await provider.close();
  });

  it('page.click() calls automationApi.click', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    await page.click('#btn');
    expect(mockApiInstance.click).toHaveBeenCalledWith('sTestSession123', '#btn');
    await provider.close();
  });

  it('page.fill() calls automationApi.type with overwrite', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    await page.fill('#email', 'user@test.com');
    expect(mockApiInstance.type).toHaveBeenCalledWith('sTestSession123', '#email', 'user@test.com', { overwrite: true });
    await provider.close();
  });

  it('page.goto() calls navigate and refreshes URL', async () => {
    mockApiInstance.pageInfo
      .mockResolvedValueOnce({ url: 'https://example.com/', title: 'Home' })
      .mockResolvedValueOnce({ url: 'https://example.com/cart', title: 'Cart' });
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    await page.goto('https://example.com/cart');
    expect(mockApiInstance.navigate).toHaveBeenLastCalledWith('sTestSession123', 'https://example.com/cart');
    await provider.close();
  });

  it('page.press() calls automationApi.keyPress', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    await page.press('#search', 'Enter');
    expect(mockApiInstance.keyPress).toHaveBeenCalledWith('sTestSession123', '#search', 'Enter');
    await provider.close();
  });

  it('page.content() returns domSnapshot', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    const content = await page.content();
    expect(mockApiInstance.domSnapshot).toHaveBeenCalled();
    expect(content).toContain('<html>');
    await provider.close();
  });

  it('page.screenshot() returns buffer from guiSnapshot', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    const buf = await page.screenshot();
    expect(mockApiInstance.guiSnapshot).toHaveBeenCalledWith('sTestSession123');
    expect(Buffer.isBuffer(buf)).toBe(true);
    await provider.close();
  });

  it('page.waitForSelector polls domSnapshot until selector found', async () => {
    mockApiInstance.domSnapshot.mockResolvedValue('<html><body><button id="btn">OK</button></body></html>');
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    const handle = await page.waitForSelector('#btn', { timeout: 5000 });
    expect(handle).toBeTruthy();
    await provider.close();
  });

  it('page.waitForSelector throws on timeout', async () => {
    mockApiInstance.domSnapshot.mockResolvedValue('<html><body></body></html>');
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    await expect(page.waitForSelector('#missing', { timeout: 100 })).rejects.toThrow('Timeout waiting for selector');
    await provider.close();
  });

  it('page.selectOption calls automationApi.select', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    const page = await provider.openUrl('https://example.com/');
    await page.selectOption('#country', 'US');
    expect(mockApiInstance.select).toHaveBeenCalledWith('sTestSession123', '#country', 'US');
    await provider.close();
  });

  it('close() resets session state', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    await provider.openUrl('https://example.com/');
    expect(provider.getActiveSessionId()).toBe('sTestSession123');
    await provider.close();
    expect(provider.getActiveSessionId()).toBeNull();
  });

  it('getAutomationApi() returns the api instance after openUrl', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await patchProviderForTest(provider);
    await provider.openUrl('https://example.com/');
    expect(provider.getAutomationApi()).toBeTruthy();
    await provider.close();
  });
});
