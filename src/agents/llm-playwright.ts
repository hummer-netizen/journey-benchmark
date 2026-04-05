import type { Page } from 'playwright';
import { DirectProvider } from '../webfuse/direct.js';
import { LLMProxy } from '../services/llm-proxy/proxy.js';
import type { AutomationProvider } from '../webfuse/provider.js';
import type { GoalAwareProvider } from '../types.js';
import type { LLMProxySummary } from '../services/llm-proxy/types.js';
import { WebfuseAgent } from './webfuse-agent.js';

/**
 * LLM + Playwright (CDP) provider.
 * Uses a local Playwright browser (DirectProvider) but executes steps
 * via the LLM agent (WebfuseAgent) instead of hardcoded selectors.
 * This corresponds to Level 2 (L2) in the diagnostic framework.
 */
export class LlmPlaywrightProvider implements AutomationProvider, GoalAwareProvider {
  private direct: DirectProvider;
  private proxy: LLMProxy;
  private proxyStarted = false;
  readonly proxyPort: number;

  constructor(headless = true, proxyPort = 8998) {
    this.proxyPort = proxyPort;
    this.direct = new DirectProvider(headless);
    this.proxy = new LLMProxy({
      port: proxyPort,
      upstreamUrl: process.env['LLM_UPSTREAM_URL'] ?? 'https://api.openai.com',
      logFile: process.env['LLM_PROXY_LOG'] ?? './logs/llm-proxy-l2.jsonl',
    });
  }

  async openUrl(url: string): Promise<Page> {
    if (!this.proxyStarted) {
      try {
        await this.proxy.start();
        this.proxyStarted = true;
        // Note: we don't globally set OPENAI_BASE_URL here to avoid
        // interfering with other providers if running in parallel,
        // although BenchmarkRunner runs sequentially.
      } catch (err) {
        console.warn(`  LLM proxy (L2) failed to start: ${err instanceof Error ? err.message : err}`);
      }
    }
    return this.direct.openUrl(url);
  }

  async close(): Promise<void> {
    await this.direct.close();
    if (this.proxyStarted) {
      await this.proxy.stop().catch(() => {});
      this.proxyStarted = false;
    }
  }

  /**
   * Execute a journey step using the LLM agent.
   */
  async executeGoal(page: Page, goal: string): Promise<void> {
    const agent = new WebfuseAgent(page, this.proxyPort, {
      model: process.env['AGENT_MODEL'] ?? 'gpt-4o',
    });
    await agent.executeGoal(goal);
  }

  getProxySummary(): LLMProxySummary {
    return this.proxy.getSummary();
  }
}
