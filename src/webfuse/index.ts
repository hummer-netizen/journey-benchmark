export type { AutomationProvider } from './provider.js';
export { DirectProvider } from './direct.js';
export { WebfuseProvider } from './webfuse.js';
export { AutomationApi } from './automation-api.js';
export type { AutomationApiOptions, AuditEntry } from './automation-api.js';

import { DirectProvider } from './direct.js';
import { WebfuseProvider } from './webfuse.js';
import { WebfuseMcpProvider } from '../agents/webfuse-mcp.js';
import { BrowserUseProvider } from '../agents/browser-use.js';
import { LlmPlaywrightProvider } from '../agents/llm-playwright.js';
import type { AutomationProvider } from './provider.js';

/** Create a provider from a name string and options */
export function createProvider(headless = true, proxyPort = 8999): AutomationProvider {
  const providerType = process.env['AUTOMATION_PROVIDER'] ?? 'direct';
  switch (providerType) {
    case 'webfuse': return new WebfuseProvider(headless);
    case 'webfuse-mcp': return new WebfuseMcpProvider(headless, proxyPort);
    case 'browser-use': return new BrowserUseProvider(headless, proxyPort);
    case 'llm-playwright': return new LlmPlaywrightProvider(headless, proxyPort - 1);
    case 'l1': return new DirectProvider(headless);
    case 'l2': return new LlmPlaywrightProvider(headless, proxyPort - 1);
    case 'l3': return new WebfuseProvider(headless);
    case 'l4': return new WebfuseMcpProvider(headless, proxyPort);
    default: return new DirectProvider(headless);
  }
}
