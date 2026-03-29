import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LLMProxy, DEFAULT_MODEL_RATES } from '../services/llm-proxy/proxy.js';
import type { LLMProxyConfig } from '../services/llm-proxy/types.js';

// Find a free port for tests
let testPort = 19100;

function makeConfig(overrides: Partial<LLMProxyConfig> = {}): LLMProxyConfig {
  return {
    port: testPort++,
    upstreamUrl: 'http://127.0.0.1:19999', // non-existent — tests that don't forward won't need it
    logFile: path.join(os.tmpdir(), `llm-proxy-test-${Date.now()}.jsonl`),
    ...overrides,
  };
}

describe('LLMProxy', () => {
  describe('DEFAULT_MODEL_RATES', () => {
    it('contains gpt-4o rates', () => {
      expect(DEFAULT_MODEL_RATES['gpt-4o']).toBeDefined();
      expect(DEFAULT_MODEL_RATES['gpt-4o']!.promptPer1M).toBe(5);
      expect(DEFAULT_MODEL_RATES['gpt-4o']!.completionPer1M).toBe(15);
    });

    it('contains gpt-4o-mini rates', () => {
      expect(DEFAULT_MODEL_RATES['gpt-4o-mini']).toBeDefined();
    });
  });

  describe('computeCost', () => {
    it('computes cost correctly for gpt-4o', () => {
      const proxy = new LLMProxy(makeConfig());
      // 1M prompt tokens at $5 + 1M completion tokens at $15 = $20
      expect(proxy.computeCost('gpt-4o', 1_000_000, 1_000_000)).toBeCloseTo(20, 5);
    });

    it('computes cost for partial token counts', () => {
      const proxy = new LLMProxy(makeConfig());
      // 100 prompt tokens at $5/1M = $0.0000005; 200 completion at $15/1M = $0.000003
      const cost = proxy.computeCost('gpt-4o', 100, 200);
      expect(cost).toBeCloseTo(100 * 5 / 1e6 + 200 * 15 / 1e6, 10);
    });

    it('falls back to gpt-4o rates for unknown model', () => {
      const proxy = new LLMProxy(makeConfig());
      const costUnknown = proxy.computeCost('unknown-model', 1000, 1000);
      const costGpt4o = proxy.computeCost('gpt-4o', 1000, 1000);
      expect(costUnknown).toBeCloseTo(costGpt4o, 10);
    });

    it('uses custom model rates when configured', () => {
      const proxy = new LLMProxy(makeConfig({
        modelRates: { 'custom-model': { promptPer1M: 10, completionPer1M: 20 } },
      }));
      const cost = proxy.computeCost('custom-model', 1_000_000, 0);
      expect(cost).toBeCloseTo(10, 5);
    });
  });

  describe('getSummary', () => {
    it('returns empty summary initially', () => {
      const proxy = new LLMProxy(makeConfig());
      const summary = proxy.getSummary();
      expect(summary.totalCalls).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(summary.calls).toHaveLength(0);
    });

    it('aggregates injected calls', () => {
      const proxy = new LLMProxy(makeConfig());
      proxy.injectCall({
        id: 'c1',
        timestamp: new Date().toISOString(),
        model: 'gpt-4o',
        latencyMs: 100,
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
        cost: 0.005,
        endpoint: '/v1/chat/completions',
      });
      proxy.injectCall({
        id: 'c2',
        timestamp: new Date().toISOString(),
        model: 'gpt-4o',
        latencyMs: 150,
        promptTokens: 300,
        completionTokens: 100,
        totalTokens: 400,
        cost: 0.003,
        endpoint: '/v1/chat/completions',
      });

      const summary = proxy.getSummary();
      expect(summary.totalCalls).toBe(2);
      expect(summary.totalPromptTokens).toBe(800);
      expect(summary.totalCompletionTokens).toBe(300);
      expect(summary.totalTokens).toBe(1100);
      expect(summary.totalCost).toBeCloseTo(0.008, 6);
    });
  });

  describe('start / stop', () => {
    let proxy: LLMProxy;

    afterEach(async () => {
      await proxy.stop().catch(() => {});
    });

    it('starts and stops without error', async () => {
      proxy = new LLMProxy(makeConfig());
      await expect(proxy.start()).resolves.toBeUndefined();
      await expect(proxy.stop()).resolves.toBeUndefined();
    });

    it('responds to requests (returns 502 when upstream is unavailable)', async () => {
      const config = makeConfig({ upstreamUrl: 'http://127.0.0.1:19998' });
      proxy = new LLMProxy(config);
      await proxy.start();

      const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: config.port, path: '/v1/chat/completions', method: 'POST',
            headers: { 'content-type': 'application/json' } },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
          }
        );
        req.on('error', reject);
        req.write(JSON.stringify({ model: 'gpt-4o', messages: [] }));
        req.end();
      });

      expect(response.status).toBe(502);
    });
  });

  describe('log file', () => {
    it('writes injected calls to the log file', () => {
      const logFile = path.join(os.tmpdir(), `proxy-log-${Date.now()}.jsonl`);
      const proxy = new LLMProxy(makeConfig({ logFile }));

      proxy.injectCall({
        id: 'log-1',
        timestamp: new Date().toISOString(),
        model: 'gpt-4o',
        latencyMs: 80,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        endpoint: '/v1/chat/completions',
      });

      expect(fs.existsSync(logFile)).toBe(true);
      const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.model).toBe('gpt-4o');
      expect(parsed.promptTokens).toBe(100);
    });
  });
});
