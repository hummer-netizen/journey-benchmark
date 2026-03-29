export type { AutomationProvider } from './provider.js';
export { DirectProvider } from './direct.js';
export { WebfuseProvider } from './webfuse.js';

import { DirectProvider } from './direct.js';
import { WebfuseProvider } from './webfuse.js';
import { WebfuseMcpProvider } from '../agents/webfuse-mcp.js';
import { BrowserUseProvider } from '../agents/browser-use.js';
import type { AutomationProvider } from './provider.js';

/** Create a provider from a name string and options */
export function createProvider(headless = true, proxyPort = 8999): AutomationProvider {
  const providerType = process.env['AUTOMATION_PROVIDER'] ?? 'direct';
  switch (providerType) {
    case 'webfuse': return new WebfuseProvider(headless);
    case 'webfuse-mcp': return new WebfuseMcpProvider(headless, proxyPort);
    case 'browser-use': return new BrowserUseProvider(headless, proxyPort);
    default: return new DirectProvider(headless);
  }
}
