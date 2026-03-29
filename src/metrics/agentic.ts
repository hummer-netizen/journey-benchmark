import fs from 'fs';
import type { ModelRates, LLMCallLog } from '../services/llm-proxy/types.js';
import type { JourneyResult } from '../types.js';

/** Providers considered "agentic" for M7 calculation */
const AGENTIC_PROVIDER_PATTERNS = [
  'webfuse-mcp',
  'browser-use',
  'webfusemcp',
  'browseruse',
  'WebfuseMcpProvider',
  'BrowserUseProvider',
];

function isAgenticProvider(provider: string): boolean {
  const lower = provider.toLowerCase();
  return AGENTIC_PROVIDER_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

/** Default pricing rates (USD per 1M tokens) */
export const DEFAULT_AGENTIC_RATES: Record<string, ModelRates> = {
  'gpt-4o': { promptPer1M: 5, completionPer1M: 15 },
  'gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.60 },
  'gpt-4': { promptPer1M: 30, completionPer1M: 60 },
  'gpt-4-turbo': { promptPer1M: 10, completionPer1M: 30 },
  'gpt-3.5-turbo': { promptPer1M: 0.5, completionPer1M: 1.5 },
};

/**
 * M6: Compute total token cost from a JSONL proxy log file.
 * Each line should be a serialised LLMCallLog object.
 * Falls back to the call's stored cost when rates for the model aren't configured.
 */
export function tokenCost(
  proxyLogFile: string,
  rates: Record<string, ModelRates> = DEFAULT_AGENTIC_RATES
): number {
  if (!fs.existsSync(proxyLogFile)) return 0;

  const content = fs.readFileSync(proxyLogFile, 'utf-8').trim();
  if (!content) return 0;

  const lines = content.split('\n').filter(Boolean);
  let total = 0;

  for (const line of lines) {
    try {
      const call = JSON.parse(line) as LLMCallLog;
      const r = rates[call.model];
      if (r) {
        total +=
          (call.promptTokens / 1_000_000) * r.promptPer1M +
          (call.completionTokens / 1_000_000) * r.completionPer1M;
      } else {
        // Use pre-computed cost from the log entry
        total += call.cost ?? 0;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return total;
}

/**
 * M7: Agentic success rate.
 * Like M1 (successRate) but only meaningful when the provider is agentic.
 * Returns 0 for non-agentic providers so it can safely be included in averages.
 */
export function agenticSuccessRate(results: JourneyResult[], provider: string): number {
  if (!isAgenticProvider(provider)) return 0;
  if (results.length === 0) return 0;
  return results.filter(r => r.status === 'passed').length / results.length;
}
