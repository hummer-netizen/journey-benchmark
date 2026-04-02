import type { Page } from 'playwright';
import { WebfuseProvider } from '../webfuse/webfuse.js';
import { LLMProxy } from '../services/llm-proxy/proxy.js';
import type { AutomationProvider } from '../webfuse/provider.js';
import type { GoalAwareProvider } from '../types.js';
import type { LLMProxySummary } from '../services/llm-proxy/types.js';
import { WebfuseAgent } from './webfuse-agent.js';

/**
 * Webfuse MCP Agent provider.
 * Wraps WebfuseProvider and starts an in-process LLM proxy for token tracking.
 * Implements GoalAwareProvider so BaseJourney can delegate goal-based steps
 * to the LLM agent (WebfuseAgent) instead of the hardcoded Playwright selectors.
 */
export class WebfuseMcpProvider implements AutomationProvider, GoalAwareProvider {
  private webfuse: WebfuseProvider;
  private proxy: LLMProxy;
  private proxyStarted = false;
  readonly proxyPort: number;

  constructor(headless = true, proxyPort = 8999) {
    this.proxyPort = proxyPort;
    this.webfuse = new WebfuseProvider(headless);
    this.proxy = new LLMProxy({
      port: proxyPort,
      upstreamUrl: process.env['LLM_UPSTREAM_URL'] ?? 'https://api.openai.com',
      logFile: process.env['LLM_PROXY_LOG'] ?? './logs/llm-proxy.jsonl',
    });
  }

  async openUrl(url: string): Promise<Page> {
    if (!this.proxyStarted) {
      try {
        await this.proxy.start();
        this.proxyStarted = true;
        // Point LLM clients at the proxy
        process.env['OPENAI_BASE_URL'] = `http://127.0.0.1:${this.proxyPort}/v1`;
        console.log(`  LLM proxy started on port ${this.proxyPort}`);
      } catch (err) {
        console.warn(`  LLM proxy failed to start: ${err instanceof Error ? err.message : err}`);
      }
    }
    return this.webfuse.openUrl(url);
  }

  async close(): Promise<void> {
    await this.webfuse.close();
    if (this.proxyStarted) {
      await this.proxy.stop().catch(() => {});
      this.proxyStarted = false;
    }
  }

  /**
   * Execute a journey step using the LLM agent instead of hardcoded selectors.
   * Called by BaseJourney when the step has a `goal` field and the provider is
   * GoalAwareProvider-compatible.
   */
  async executeGoal(page: Page, goal: string): Promise<void> {
    const agent = new WebfuseAgent(page, this.proxyPort, {
      automationApi: this.webfuse.getAutomationApi() ?? undefined,
      sessionId: this.webfuse.getActiveSessionId() ?? undefined,
    });
    await agent.executeGoal(goal);
  }

  getProxySummary(): LLMProxySummary {
    return this.proxy.getSummary();
  }
}
