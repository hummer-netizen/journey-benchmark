import { WebfuseProvider } from '../webfuse/webfuse.js';
import { J00TheGym } from '../journeys/j00-the-gym.js';
import { BenchmarkRunner } from '../runner/runner.js';
import { SiteConfig } from '../types.js';

/**
 * L3 Diagnostic Runner: Scripted Webfuse (Direct API)
 * 
 * Executes J00 components using direct act.* calls through the Webfuse proxy
 * via the native WebfuseProvider (Track C).
 * 
 * CORE REQUIREMENT: This bypasses the WebfuseMcpProvider/WebfuseAgent entirely.
 * It uses the hardcoded 'execute' block in the journey steps, not the 'goal' string.
 * This isolates platform-side event/DOM gaps from agent reasoning.
 */

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';

const gymConfig: SiteConfig = {
  baseUrl: GYM_URL,
  selectors: {} as any,
  credentials: {} as any
};

async function main() {
  console.log('=== L3 DIAGNOSTIC: Scripted Webfuse (DIRECT PROVIDER - NO AGENT) ===');
  
  // L3 must use the native WebfuseProvider directly to bypass the agent layer
  const provider = new WebfuseProvider(true); 
  const journey = new J00TheGym(gymConfig);

  const runner = new BenchmarkRunner({
    provider,
    journeys: [journey],
    baseUrl: GYM_URL,
    site: 'J00 Gym',
    level: 3
  });

  try {
    const result = await runner.run();
    console.log('\n=== L3 DIAGNOSTIC COMPLETE ===');
    console.log(`Status: ${result.journeys[0].status.toUpperCase()}`);
    console.log(`Steps Passed: ${result.journeys[0].stepsCompleted}/${result.journeys[0].stepsTotal}`);
    
    // Summary of failures (Fail-fast check)
    const failures = result.journeys[0].steps.filter(s => s.status !== 'passed');
    if (failures.length > 0) {
      console.log('\nPlatform Blockers (L3 Scripted Failures):');
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
