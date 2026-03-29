/** A single intercepted LLM API call */
export interface LLMCallLog {
  id: string;
  timestamp: string;
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  endpoint: string;
}

/** Per-model pricing rates (USD per 1M tokens) */
export interface ModelRates {
  promptPer1M: number;
  completionPer1M: number;
}

/** LLM proxy server configuration */
export interface LLMProxyConfig {
  port: number;
  /** Upstream LLM API base URL (e.g. https://api.openai.com) */
  upstreamUrl: string;
  /** Path to JSONL log file */
  logFile: string;
  /** Per-model rate overrides */
  modelRates?: Record<string, ModelRates>;
}

/** Aggregated summary of all intercepted calls */
export interface LLMProxySummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  calls: LLMCallLog[];
}
