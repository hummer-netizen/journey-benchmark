export type { AutomationProvider } from './provider.js';
export { DirectProvider } from './direct.js';
export { WebfuseProvider } from './webfuse.js';

import { DirectProvider } from './direct.js';
import { WebfuseProvider } from './webfuse.js';
import type { AutomationProvider } from './provider.js';

/** Create a provider based on AUTOMATION_PROVIDER env var */
export function createProvider(headless = true): AutomationProvider {
  const providerType = process.env['AUTOMATION_PROVIDER'] ?? 'direct';
  if (providerType === 'webfuse') {
    return new WebfuseProvider();
  }
  return new DirectProvider(headless);
}
