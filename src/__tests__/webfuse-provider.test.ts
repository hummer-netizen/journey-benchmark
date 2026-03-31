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
  domSnapshot: vi.fn().mockResolvedValue('<html><body><button id="btn" wf-id="wf1">Click me</button><input id="email" wf-id="wf2" /></body></html>'),
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
// Patch the provider to skip REST API session creation — use WEBFUSE_SESSION_ID env
// ---------------------------------------------------------------------------

describe('WebfuseProvider', () => {
  const origEnv = process.env;

  beforeEach(() => {
    // Set both required keys + a pre-existing session ID to avoid REST API calls
    process.env = {
      ...origEnv,
      WEBFUSE_AUTOMATION_KEY: 'ak_test_key',
      WEBFUSE_COMPANY_KEY: 'ck_test_key',
      WEBFUSE_SESSION_ID: 'sTestSession123',
    };
    vi.clearAllMocks();
    mockApiInstance.navigate.mockResolvedValue('Navigated');
    mockApiInstance.pageInfo.mockResolvedValue({ url: 'https://example.com/page', title: 'Test Page' });
    mockApiInstance.domSnapshot.mockResolvedValue('<html><body><button id="btn" wf-id="wf1">Click me</button><input id="email" wf-id="wf2" /></body></html>');
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

  it('openUrl uses WEBFUSE_SESSION_ID and navigates to the given URL', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await provider.openUrl('https://example.com/shop');
    expect(mockApiInstance.navigate).toHaveBeenCalledWith('sTestSession123', 'https://example.com/shop');
    await provider.close();
  });

  it('session_id comes from WEBFUSE_SESSION_ID env var', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await provider.openUrl('https://example.com/');
    expect(provider.getActiveSessionId()).toBe('sTestSession123');
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
    const page = await provider.openUrl('https://example.com/page');
    expect(page.url()).toBe('https://example.com/page');
    await provider.close();
  });

  it('page.click() calls automationApi.click', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    await page.click('#btn');
    // Should resolve to wf-id target via domSnapshot
    expect(mockApiInstance.click).toHaveBeenCalled();
    await provider.close();
  });

  it('page.fill() calls automationApi.type with overwrite in options', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    await page.fill('#email', 'user@test.com');
    // Should call type with overwrite option
    expect(mockApiInstance.type).toHaveBeenCalledWith(
      'sTestSession123',
      expect.any(String),
      'user@test.com',
      { overwrite: true }
    );
    await provider.close();
  });

  it('page.goto() calls navigate and refreshes URL', async () => {
    mockApiInstance.pageInfo
      .mockResolvedValueOnce({ url: 'https://example.com/', title: 'Home' })
      .mockResolvedValueOnce({ url: 'https://example.com/', title: 'Home' })
      .mockResolvedValueOnce({ url: 'https://example.com/cart', title: 'Cart' });
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    await page.goto('https://example.com/cart');
    expect(mockApiInstance.navigate).toHaveBeenLastCalledWith('sTestSession123', 'https://example.com/cart');
    await provider.close();
  });

  it('page.press() calls automationApi.keyPress', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    await page.press('#search', 'Enter');
    expect(mockApiInstance.keyPress).toHaveBeenCalled();
    await provider.close();
  });

  it('page.content() returns domSnapshot with wf-ids', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    const content = await page.content();
    expect(mockApiInstance.domSnapshot).toHaveBeenCalledWith('sTestSession123', { webfuseIDs: true });
    expect(content).toContain('<html>');
    await provider.close();
  });

  it('page.screenshot() returns buffer from guiSnapshot', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    const buf = await page.screenshot();
    expect(mockApiInstance.guiSnapshot).toHaveBeenCalledWith('sTestSession123');
    expect(Buffer.isBuffer(buf)).toBe(true);
    await provider.close();
  });

  it('page.waitForSelector polls domSnapshot until selector found', async () => {
    mockApiInstance.domSnapshot.mockResolvedValue('<html><body><button id="btn" wf-id="wf1">OK</button></body></html>');
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    const handle = await page.waitForSelector('#btn', { timeout: 5000 });
    expect(handle).toBeTruthy();
    await provider.close();
  });

  it('page.waitForSelector throws on timeout', async () => {
    mockApiInstance.domSnapshot.mockResolvedValue('<html><body></body></html>');
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    await expect(page.waitForSelector('#missing', { timeout: 100 })).rejects.toThrow('Timeout waiting for selector');
    await provider.close();
  });

  it('page.selectOption calls automationApi.select with value attribute', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    await page.selectOption('#country', 'US');
    expect(mockApiInstance.select).toHaveBeenCalledWith('sTestSession123', expect.any(String), 'US');
    await provider.close();
  });

  it('page.selectOption extracts value from object with value property', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    const page = await provider.openUrl('https://example.com/');
    await page.selectOption('#country', { value: 'DE' });
    expect(mockApiInstance.select).toHaveBeenCalledWith('sTestSession123', expect.any(String), 'DE');
    await provider.close();
  });

  it('close() resets session state', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await provider.openUrl('https://example.com/');
    expect(provider.getActiveSessionId()).toBe('sTestSession123');
    await provider.close();
    expect(provider.getActiveSessionId()).toBeNull();
  });

  it('getAutomationApi() returns the api instance after openUrl', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await provider.openUrl('https://example.com/');
    expect(provider.getAutomationApi()).toBeTruthy();
    await provider.close();
  });

  it('does not use Playwright or launch any browser', async () => {
    const { WebfuseProvider } = await import('../webfuse/webfuse.js');
    const provider = new WebfuseProvider();
    await provider.openUrl('https://example.com/');
    // WebfuseProvider should have no _browser property
    expect((provider as unknown as Record<string, unknown>)['_browser']).toBeUndefined();
    await provider.close();
  });
});
