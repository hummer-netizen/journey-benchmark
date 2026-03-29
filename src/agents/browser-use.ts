import { execSync } from 'child_process';
import type { Page } from 'playwright';
import type { AutomationProvider } from '../webfuse/provider.js';
import { DirectProvider } from '../webfuse/direct.js';

/** Check whether the browser-use Python package is installed */
function isBrowserUseInstalled(): boolean {
  try {
    execSync('python3 -c "import browser_use"', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Browser Use provider — wraps the browser-use Python library.
 *
 * If browser-use is not installed, falls back to DirectProvider with a warning.
 * When available, spawns a Python subprocess and communicates via CDP.
 *
 * To install: pip install browser-use
 */
export class BrowserUseProvider implements AutomationProvider {
  private fallback: DirectProvider;
  readonly available: boolean;
  readonly proxyPort: number;

  constructor(headless = true, proxyPort = 8999) {
    this.proxyPort = proxyPort;
    this.available = isBrowserUseInstalled();
    this.fallback = new DirectProvider(headless);

    if (!this.available) {
      console.warn(
        'WARNING: browser-use Python package not found.\n' +
        '  Install with: pip install browser-use\n' +
        '  Falling back to DirectProvider for this run.'
      );
    } else {
      // When running for real, LLM calls route through the proxy
      process.env['OPENAI_BASE_URL'] = `http://127.0.0.1:${proxyPort}/v1`;
    }
  }

  async openUrl(url: string): Promise<Page> {
    if (!this.available) {
      return this.fallback.openUrl(url);
    }

    // Real browser-use integration: spawn Python subprocess and connect via CDP.
    // The Python script launches a browser, sets up browser-use agent, and prints the CDP endpoint.
    // We then connect Playwright to that endpoint and return the active page.
    //
    // This is a stub until a concrete task/goal API is defined for each journey.
    // For now we fall through to DirectProvider so journeys can still execute.
    console.warn('browser-use package found but CDP bridge not yet configured — using DirectProvider');
    return this.fallback.openUrl(url);
  }

  async close(): Promise<void> {
    await this.fallback.close();
  }
}
