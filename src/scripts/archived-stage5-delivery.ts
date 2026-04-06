import { DirectProvider } from '../webfuse/direct.js';
import { WebfuseProvider } from '../webfuse/webfuse.js';
import { WebfuseMcpProvider } from '../agents/webfuse-mcp.js';
import { LlmPlaywrightProvider } from '../agents/llm-playwright.js';
import { J00TheGym } from '../journeys/j00-the-gym.js';
import { J01ProductPurchase } from '../journeys/j01-product-purchase.js';
import { J04CartRecovery } from '../journeys/j04-cart-recovery.js';
import { J05FlightBooking } from '../journeys/j05-flight-booking.js';
import { J08AccountRegistration } from '../journeys/j08-account-registration.js';
import { J09PasswordReset } from '../journeys/j09-password-reset.js';
import { J12GovernmentForm } from '../journeys/j12-government-form.js';
import { J14ProductComparison } from '../journeys/j14-product-comparison.js';
import { J17ReturnRefund } from '../journeys/j17-return-refund.js';
import { BenchmarkRunner } from '../runner/runner.js';
import { RunResult, SiteConfig } from '../types.js';
import fs from 'fs';
import path from 'path';

/**
 * Stage 5: DELIVERY — Full Diagnostic Run
 * 
 * Executes all 8 journeys across 4 levels.
 * 'Diagnostic Mode': Sessions are NOT terminated.
 */

// Override WebfuseProvider to disable session termination for Stage 5
class DiagnosticWebfuseProvider extends WebfuseProvider {
  async close(): Promise<void> {
    console.log('  [Diagnostic Mode] Skipping session termination to preserve recording.');
  }
}

class DiagnosticWebfuseMcpProvider extends WebfuseMcpProvider {
  async close(): Promise<void> {
    console.log('  [Diagnostic Mode] Skipping session termination to preserve recording.');
  }
}

const BASE_URL = process.env['BASE_URL'] ?? 'https://gym-diagnostic.webfuse.it';

async function runLevel(level: 1 | 2 | 3 | 4, journeys: any[]): Promise<RunResult> {
  let provider;
  switch (level) {
    case 1: provider = new DirectProvider(true); break;
    case 2: provider = new LlmPlaywrightProvider(true, 9500); break;
    case 3: provider = new DiagnosticWebfuseProvider(true); break;
    case 4: provider = new DiagnosticWebfuseMcpProvider(true, 9600); break;
    default: throw new Error('Invalid level');
  }

  const runner = new BenchmarkRunner({
    provider,
    journeys,
    baseUrl: BASE_URL,
    site: 'Full Suite',
    level
  });

  const result = await runner.run();
  await provider.close();
  return result;
}

const mockConfig = (url: string): SiteConfig => ({
  baseUrl: url,
  selectors: {} as any,
  credentials: {} as any
});

async function main() {
  const journeys = [
    new J00TheGym({ baseUrl: 'https://gym-diagnostic.webfuse.it' }),
    new J01ProductPurchase(mockConfig('https://webarena-shop.webfuse.it')),
    new J04CartRecovery(mockConfig('https://webarena-shop.webfuse.it')),
    new J05FlightBooking(mockConfig('https://flight-app.webfuse.it')),
    new J08AccountRegistration(mockConfig('https://registration-app.webfuse.it')),
    new J09PasswordReset(mockConfig('https://reset-app.webfuse.it')),
    new J12GovernmentForm(mockConfig('https://government-form.webfuse.it')),
    new J14ProductComparison(mockConfig('https://webarena-shop.webfuse.it')),
    new J17ReturnRefund(mockConfig('https://return-app.webfuse.it'))
  ];

  const levels: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];
  const results: RunResult[] = [];

  for (const level of levels) {
    console.log(`\n=== STARTING LEVEL L${level} ===`);
    results.push(await runLevel(level, journeys));
  }

  // Generate Parity Report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(process.cwd(), 'reports', `parity-analysis-${timestamp}.md`);
  
  let report = '# Stage 5: Parity Gap Analysis Report\n\n';
  report += `**Date:** ${new Date().toISOString()}\n\n`;
  report += '| Journey | L1 (Scripted PW) | L2 (LLM PW) | L3 (Scripted WF) | L4 (Agent WF) | Verdict |\n';
  report += '|---------|------------------|-------------|------------------|----------------|---------|\n';

  for (const j of journeys) {
    const l1 = results.find(r => r.diagnostic?.level === 1)?.journeys.find(jr => jr.journeyId === j.id)?.status === 'passed' ? '✅' : '❌';
    const l2 = results.find(r => r.diagnostic?.level === 2)?.journeys.find(jr => jr.journeyId === j.id)?.status === 'passed' ? '✅' : '❌';
    const l3 = results.find(r => r.diagnostic?.level === 3)?.journeys.find(jr => jr.journeyId === j.id)?.status === 'passed' ? '✅' : '❌';
    const l4 = results.find(r => r.diagnostic?.level === 4)?.journeys.find(jr => jr.journeyId === j.id)?.status === 'passed' ? '✅' : '❌';
    
    let verdict = '—';
    if (l1 === '✅' && l3 === '❌') verdict = '**Platform Gap**';
    else if (l3 === '✅' && l4 === '❌') verdict = '**Agent Tax**';
    else if (l1 === '✅' && l4 === '✅') verdict = '**Full Parity**';

    report += `| ${j.id} | ${l1} | ${l2} | ${l3} | ${l4} | ${verdict} |\n`;
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport generated: ${reportPath}`);
}

main().catch(console.error);
