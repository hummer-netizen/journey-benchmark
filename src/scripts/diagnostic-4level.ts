import { DirectProvider } from '../webfuse/direct.js';
import { WebfuseProvider } from '../webfuse/webfuse.js';
import { WebfuseMcpProvider } from '../agents/webfuse-mcp.js';
import { J00TheGym } from '../journeys/j00-the-gym.js';
import { BenchmarkRunner } from '../runner/runner.js';
import { SiteConfig, RunResult } from '../types.js';
import fs from 'fs';
import path from 'path';

/**
 * 4-Level Diagnostic Runner
 * 
 * Executes J00 Gym across all 4 levels:
 * - L1: Scripted Playwright (Baseline)
 * - L2: LLM + Playwright (CDP) [Implemented as Agentic with DirectProvider]
 * - L3: Scripted Webfuse (Direct API)
 * - L4: Agentic Webfuse (Native MCP)
 */

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';

const gymConfig: SiteConfig = {
  baseUrl: GYM_URL,
  selectors: {} as any,
  credentials: {} as any
};

async function runLevel(level: 1 | 2 | 3 | 4): Promise<RunResult> {
  let provider;
  let label = '';

  switch (level) {
    case 1:
      label = 'L1: Scripted Playwright';
      provider = new DirectProvider(true);
      break;
    case 2:
      label = 'L2: LLM Playwright (CDP)';
      // Using WebfuseMcpProvider with a DirectProvider logic 
      // (Simplified: we use the agent but local browser)
      // Note: Full implementation would use a dedicated LLMPlaywrightProvider
      provider = new DirectProvider(true); 
      break;
    case 3:
      label = 'L3: Scripted Webfuse (Direct API)';
      provider = new WebfuseProvider(true);
      break;
    case 4:
      label = 'L4: Agentic Webfuse (Native MCP)';
      provider = new WebfuseMcpProvider(true, 9400 + level);
      break;
  }

  console.log(`\n=== STARTING ${label} ===`);
  const journey = new J00TheGym(gymConfig);
  const runner = new BenchmarkRunner({
    provider,
    journeys: [journey],
    baseUrl: GYM_URL,
    site: 'J00 Gym',
    level
  });

  const result = await runner.run();
  await provider.close();
  return result;
}

async function main() {
  const levels: (1 | 2 | 3 | 4)[] = [1, 3, 4]; // Skipping L2 placeholder for now
  const allResults: RunResult[] = [];

  for (const level of levels) {
    try {
      const result = await runLevel(level);
      allResults.push(result);
    } catch (err) {
      console.error(`Level ${level} failed:`, err);
    }
  }

  // Generate Parity Report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(process.cwd(), 'reports', `diagnostic-parity-${timestamp}.md`);
  
  let report = `# 4-Level Diagnostic Parity Report\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n\n`;
  report += `| Component | L1 (Baseline) | L3 (Platform) | L4 (Agent) | Gap |\n`;
  report += `|-----------|---------------|---------------|------------|-----|\n`;

  const j0 = allResults[0]?.journeys[0];
  if (j0) {
    for (let i = 0; i < j0.steps.length; i++) {
      const stepName = j0.steps[i].stepName;
      const l1 = allResults.find(r => r.diagnostic?.level === 1)?.journeys[0].steps[i]?.status === 'passed' ? '✅' : '❌';
      const l3 = allResults.find(r => r.diagnostic?.level === 3)?.journeys[0].steps[i]?.status === 'passed' ? '✅' : '❌';
      const l4 = allResults.find(r => r.diagnostic?.level === 4)?.journeys[0].steps[i]?.status === 'passed' ? '✅' : '❌';
      
      let gap = '—';
      if (l1 === '✅' && l3 === '❌') gap = '**Platform Gap**';
      else if (l3 === '✅' && l4 === '❌') gap = '**Agent Tax**';

      report += `| ${stepName} | ${l1} | ${l3} | ${l4} | ${gap} |\n`;
    }
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  console.log(`\nParity Report generated: ${reportPath}`);
}

main().catch(console.error);
