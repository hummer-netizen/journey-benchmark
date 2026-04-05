import type { Page } from 'playwright';
import { WebfuseMcpProvider } from '../agents/webfuse-mcp.js';
import { J00TheGym } from '../journeys/j00-the-gym.js';
import { BenchmarkRunner } from '../runner/runner.js';
import { SiteConfig } from '../types.js';

/**
 * L3 Diagnostic Runner: Scripted Webfuse (Direct API)
 * 
 * Executes J00 components using direct act.* calls through the Webfuse proxy,
 * bypassing the LLM agent (L4). This isolates platform-side event/DOM gaps
 * from agent-side reasoning/retry overhead ("Agent Tax").
 * 
 * Every FLAKY result (≥8 calls) is treated as a TOTAL FAILURE per Nicholas directive.
 */

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';

const gymConfig: SiteConfig = {
  baseUrl: GYM_URL,
  selectors: {} as any,
  credentials: {} as any
};

async function main() {
  console.log('=== L3 DIAGNOSTIC: Scripted Webfuse (Direct API) ===');
  
  // Use WebfuseMcpProvider but force L3 logic in the runner
  const provider = new WebfuseMcpProvider(true, 9300);
  const journey = new J00TheGym(gymConfig);

  const runner = new BenchmarkRunner({
    provider,
    journeys: [journey],
    baseUrl: GYM_URL,
    site: 'J00 Gym',
    level: 3 // Set to L3
  });

  try {
    const result = await runner.run();
    console.log('\n=== L3 DIAGNOSTIC COMPLETE ===');
    console.log(`Status: ${result.journeys[0].status.toUpperCase()}`);
    console.log(`Steps Passed: ${result.journeys[0].stepsCompleted}/${result.journeys[0].stepsTotal}`);
    
    // Summary of failures (Fail-fast check)
    const failures = result.journeys[0].steps.filter(s => s.status !== 'passed');
    if (failures.length > 0) {
      console.log('\nPlatform Blockers (L3 Failures):');
      failures.forEach(f => console.log(`- ${f.stepName}: ${f.errorMessage || 'Unknown error'}`));
    }
  } catch (err) {
    console.error('L3 Execution Failed:', err);
    process.exit(1);
  } finally {
    await provider.close();
  }
}

main().catch(console.error);
