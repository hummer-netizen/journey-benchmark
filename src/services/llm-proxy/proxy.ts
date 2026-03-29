import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { LLMCallLog, LLMProxyConfig, LLMProxySummary, ModelRates } from './types.js';

export const DEFAULT_MODEL_RATES: Record<string, ModelRates> = {
  'gpt-4o': { promptPer1M: 5, completionPer1M: 15 },
  'gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.60 },
  'gpt-4': { promptPer1M: 30, completionPer1M: 60 },
  'gpt-4-turbo': { promptPer1M: 10, completionPer1M: 30 },
  'gpt-3.5-turbo': { promptPer1M: 0.5, completionPer1M: 1.5 },
};

/** In-process HTTP proxy that intercepts LLM API calls for logging and cost tracking */
export class LLMProxy {
  private server: http.Server | null = null;
  private calls: LLMCallLog[] = [];
  private config: LLMProxyConfig;
  private modelRates: Record<string, ModelRates>;

  constructor(config: LLMProxyConfig) {
    this.config = config;
    this.modelRates = { ...DEFAULT_MODEL_RATES, ...config.modelRates };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.handleRequest.bind(this));
      this.server.listen(this.config.port, '127.0.0.1', () => resolve());
      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  get port(): number {
    return this.config.port;
  }

  getSummary(): LLMProxySummary {
    const totalPromptTokens = this.calls.reduce((s, c) => s + c.promptTokens, 0);
    const totalCompletionTokens = this.calls.reduce((s, c) => s + c.completionTokens, 0);
    return {
      totalCalls: this.calls.length,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalCost: this.calls.reduce((s, c) => s + c.cost, 0),
      calls: [...this.calls],
    };
  }

  /** Inject a call log directly (used in testing or for synthetic events) */
  injectCall(call: LLMCallLog): void {
    this.calls.push(call);
    this.appendToLog(call);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const callId = randomUUID();
    const startTime = Date.now();
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      this.forwardRequest(callId, startTime, req, body, res);
    });
    req.on('error', () => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Request error' }));
    });
  }

  private forwardRequest(
    callId: string,
    startTime: number,
    req: http.IncomingMessage,
    body: string,
    res: http.ServerResponse
  ): void {
    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(this.config.upstreamUrl);
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Invalid upstream URL' }));
      return;
    }

    const isHttps = upstreamUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;

    // Remove transfer-encoding to avoid chunked encoding issues
    const headers = { ...req.headers };
    delete headers['transfer-encoding'];
    delete headers['content-length'];
    if (body) {
      headers['content-length'] = String(Buffer.byteLength(body, 'utf-8'));
    }
    headers['host'] = upstreamUrl.hostname;

    const options: http.RequestOptions = {
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port ? parseInt(upstreamUrl.port, 10) : defaultPort,
      path: req.url,
      method: req.method,
      headers,
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      const responseChunks: Buffer[] = [];
      proxyRes.on('data', (chunk: Buffer) => responseChunks.push(chunk));
      proxyRes.on('end', () => {
        const latencyMs = Date.now() - startTime;
        const responseBody = Buffer.concat(responseChunks).toString('utf-8');

        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(responseBody) as Record<string, unknown>; } catch {}

        const usage = parsed['usage'] as Record<string, number> | undefined;
        const model = (parsed['model'] as string) ?? this.extractModelFromRequest(body);
        const promptTokens = usage?.['prompt_tokens'] ?? 0;
        const completionTokens = usage?.['completion_tokens'] ?? 0;
        const totalTokens = usage?.['total_tokens'] ?? (promptTokens + completionTokens);
        const cost = this.computeCost(model, promptTokens, completionTokens);

        const callLog: LLMCallLog = {
          id: callId,
          timestamp: new Date(startTime).toISOString(),
          model,
          latencyMs,
          promptTokens,
          completionTokens,
          totalTokens,
          cost,
          endpoint: req.url ?? '/',
        };

        this.calls.push(callLog);
        this.appendToLog(callLog);

        res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
        res.end(responseBody);
      });
      proxyRes.on('error', () => {
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'Upstream response error' }));
      });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Proxy upstream error', message: err.message }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  }

  private extractModelFromRequest(body: string): string {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      return (parsed['model'] as string) ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  computeCost(model: string, promptTokens: number, completionTokens: number): number {
    const rates = this.modelRates[model] ?? this.modelRates['gpt-4o'];
    if (!rates) return 0;
    return (promptTokens / 1_000_000) * rates.promptPer1M +
           (completionTokens / 1_000_000) * rates.completionPer1M;
  }

  private appendToLog(callLog: LLMCallLog): void {
    try {
      const logDir = path.dirname(this.config.logFile);
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(this.config.logFile, JSON.stringify(callLog) + '\n', 'utf-8');
    } catch {
      // Log write failures are non-fatal
    }
  }
}
