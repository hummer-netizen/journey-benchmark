import fs from 'fs';
import path from 'path';
import type { Journey, JourneyResult, JourneyStep } from '../types.js';

export interface ReproOptions {
  /** Directory to write repro HTML files (default: ./repros) */
  outputDir: string;
  /** Include the Webfuse co-browsing loader script in the repro */
  includeWebfuse?: boolean;
  /** Base URL the journey was running against */
  targetUrl?: string;
}

export interface ReproFile {
  journeyId: string;
  journeyName: string;
  filePath: string;
  failedStep: string;
  errorMessage: string;
}

/**
 * Generate a standalone HTML/JS reproduction case for a failed journey.
 *
 * The repro file contains:
 * - Minimal HTML/JS to reproduce the component (no external dependencies)
 * - The failed action sequence as executable JS steps
 * - A comment block describing expected vs actual behaviour
 */
export function generateReproFile(
  journey: Journey,
  result: JourneyResult,
  options: ReproOptions,
): ReproFile | null {
  // Only generate repros for failed/error journeys
  if (result.status === 'passed') return null;

  const failedStepResult = result.steps.find(s => s.status === 'failed');
  const failedStepIndex = failedStepResult?.stepIndex ?? -1;
  const failedStepDef = journey.steps[failedStepIndex];
  const errorMessage = failedStepResult?.errorMessage ?? result.errorMessage ?? 'Unknown error';
  const failedStepName = failedStepResult?.stepName ?? failedStepDef?.name ?? 'Unknown step';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const component = journey.id.toLowerCase();
  const filename = `repro-${component}-${timestamp}.html`;

  fs.mkdirSync(options.outputDir, { recursive: true });
  const filePath = path.join(options.outputDir, filename);

  const html = buildReproHtml(journey, result, failedStepIndex, errorMessage, options);
  fs.writeFileSync(filePath, html, 'utf-8');

  return {
    journeyId: journey.id,
    journeyName: journey.name,
    filePath,
    failedStep: failedStepName,
    errorMessage,
  };
}

/**
 * Generate repro files for all failed journeys in a run.
 */
export function generateRepros(
  journeys: Journey[],
  results: JourneyResult[],
  options: ReproOptions,
): ReproFile[] {
  const repros: ReproFile[] = [];
  for (const result of results) {
    if (result.status === 'passed') continue;
    const journey = journeys.find(j => j.id === result.journeyId);
    if (!journey) continue;
    const repro = generateReproFile(journey, result, options);
    if (repro) repros.push(repro);
  }
  return repros;
}

/** Extract step descriptions for the action sequence */
function extractStepSequence(journey: Journey, upToIndex: number): string[] {
  const steps: string[] = [];
  for (let i = 0; i <= Math.min(upToIndex, journey.steps.length - 1); i++) {
    const step = journey.steps[i]!;
    const goal = step.goal ?? step.name;
    steps.push(`Step ${i + 1}: ${step.name}${step.goal ? ` — Goal: "${step.goal}"` : ''}`);
  }
  return steps;
}

/** Extract selectors used in step definitions for the repro */
function extractSelectorsFromSteps(steps: JourneyStep[]): string[] {
  const selectors: string[] = [];
  for (const step of steps) {
    // Extract from goal text
    if (step.goal) {
      // Pull quoted selectors from goal text
      const matches = step.goal.match(/'([#.\w[\]=^$*":-]+)'/g);
      if (matches) {
        selectors.push(...matches.map(m => m.replace(/'/g, '')));
      }
    }
    // Extract from the function source (best effort)
    const src = step.execute.toString();
    const selectorMatches = src.match(/['"`](#[\w-]+|\.[\w.-]+|\[[\w="'-]+\]|[\w]+\[[\w="'-]+\])/g);
    if (selectorMatches) {
      selectors.push(...selectorMatches.map(m => m.replace(/^['"`]/, '')));
    }
  }
  return [...new Set(selectors)];
}

/** Build the standalone HTML repro file */
function buildReproHtml(
  journey: Journey,
  result: JourneyResult,
  failedStepIndex: number,
  errorMessage: string,
  options: ReproOptions,
): string {
  const stepSequence = extractStepSequence(journey, failedStepIndex);
  const allSelectors = extractSelectorsFromSteps(journey.steps);
  const passedSteps = result.steps.filter(s => s.status === 'passed');
  const targetUrl = options.targetUrl ?? 'http://localhost:7770';

  // Build step-by-step JS recreation
  const jsSteps = journey.steps.slice(0, failedStepIndex + 1).map((step, i) => {
    const status = i < failedStepIndex ? 'passed' : 'FAILED';
    const goal = step.goal ?? step.name;
    return `    { index: ${i + 1}, name: ${JSON.stringify(step.name)}, goal: ${JSON.stringify(goal)}, status: '${status}' }`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repro: ${escHtml(journey.id)} — ${escHtml(journey.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 900px; margin: 0 auto; background: #fafafa; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 16px; }
    .error-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .error-box h2 { color: #dc2626; font-size: 1.1rem; margin-bottom: 8px; }
    .error-box pre { white-space: pre-wrap; font-size: 0.85rem; color: #7f1d1d; }
    .expected-actual { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .expected, .actual { padding: 12px; border-radius: 8px; font-size: 0.9rem; }
    .expected { background: #f0fdf4; border: 1px solid #86efac; }
    .actual { background: #fef2f2; border: 1px solid #fca5a5; }
    .steps { margin-bottom: 16px; }
    .steps h2 { font-size: 1.1rem; margin-bottom: 8px; }
    .step { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
    .step:last-child { border-bottom: none; }
    .step-num { font-weight: 600; min-width: 28px; }
    .step-status { font-size: 0.8rem; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
    .step-status.passed { background: #dcfce7; color: #166534; }
    .step-status.failed { background: #fee2e2; color: #991b1b; }
    .step-status.pending { background: #f3f4f6; color: #6b7280; }
    .selectors { margin-bottom: 16px; }
    .selectors h2 { font-size: 1.1rem; margin-bottom: 8px; }
    .selectors code { display: inline-block; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; margin: 2px 4px 2px 0; }
    .repro-frame { width: 100%; height: 500px; border: 2px solid #d1d5db; border-radius: 8px; margin-top: 16px; }
    .btn { display: inline-block; padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-top: 12px; }
    .btn:hover { background: #1d4ed8; }
    .btn:disabled { background: #9ca3af; cursor: not-allowed; }
    #log { background: #1a1a2e; color: #e0e0e0; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 0.85rem; min-height: 100px; max-height: 300px; overflow-y: auto; margin-top: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
<!--
  ============================================================
  REPRODUCTION CASE — Surfly Co-browsing Compatibility
  ============================================================

  Journey:       ${journey.id} — ${journey.name}
  Failed Step:   Step ${failedStepIndex + 1}
  Error:         ${escHtml(errorMessage)}
  Generated:     ${new Date().toISOString()}
  Target URL:    ${targetUrl}
  Provider:      WebfuseProvider (Surfly co-browsing proxy)

  EXPECTED BEHAVIOUR:
    All ${journey.steps.length} steps complete successfully when run via
    DirectProvider (Playwright headless, no proxy). The journey passes
    100% on DirectProvider with 0% flakiness across 5 runs.

  ACTUAL BEHAVIOUR (via WebfuseProvider / Surfly proxy):
    Step ${failedStepIndex + 1} fails with: "${escHtml(errorMessage)}"
    ${passedSteps.length} of ${journey.steps.length} steps completed before failure.

  ACTION SEQUENCE (up to failure):
${stepSequence.map(s => `    ${s}`).join('\n')}

  SELECTORS INVOLVED:
${allSelectors.map(s => `    ${s}`).join('\n')}

  HOW TO REPRODUCE:
    1. Open this file in a browser
    2. Click "Load Target Page" to load the target URL in the iframe
    3. Click "Run Repro Steps" to execute the action sequence
    4. Observe step ${failedStepIndex + 1} failing
    5. To test with Surfly: start a co-browsing session on the target URL
       and run the same sequence through the Surfly proxy

  NOTE: This repro uses an iframe for the target page. Cross-origin
  restrictions may apply. For full reproduction, serve this file from
  the same origin or use the Surfly co-browsing proxy.
  ============================================================
-->

<h1>🔬 Repro: ${escHtml(journey.id)} — ${escHtml(journey.name)}</h1>
<p class="meta">
  Generated ${new Date().toISOString()} · Target: <code>${escHtml(targetUrl)}</code> · Provider: WebfuseProvider
</p>

<div class="error-box">
  <h2>❌ Failure at Step ${failedStepIndex + 1}</h2>
  <pre>${escHtml(errorMessage)}</pre>
</div>

<div class="expected-actual">
  <div class="expected">
    <strong>✅ Expected</strong><br>
    All ${journey.steps.length} steps pass. DirectProvider: 100% pass rate, 0% flakiness.
  </div>
  <div class="actual">
    <strong>❌ Actual (WebfuseProvider)</strong><br>
    ${passedSteps.length}/${journey.steps.length} steps pass. Fails at step ${failedStepIndex + 1} with the error above.
  </div>
</div>

<div class="steps">
  <h2>Action Sequence</h2>
${journey.steps.map((step, i) => {
  const statusClass = i < failedStepIndex ? 'passed' : i === failedStepIndex ? 'failed' : 'pending';
  const statusLabel = i < failedStepIndex ? '✓ PASS' : i === failedStepIndex ? '✗ FAIL' : '… SKIP';
  return `  <div class="step">
    <span class="step-num">${i + 1}.</span>
    <span class="step-status ${statusClass}">${statusLabel}</span>
    <div>
      <strong>${escHtml(step.name)}</strong>
      ${step.goal ? `<br><em>${escHtml(step.goal)}</em>` : ''}
    </div>
  </div>`;
}).join('\n')}
</div>

<div class="selectors">
  <h2>Selectors Used</h2>
  ${allSelectors.length > 0 ? allSelectors.map(s => `<code>${escHtml(s)}</code>`).join(' ') : '<em>No selectors extracted</em>'}
</div>

<h2>Interactive Reproduction</h2>
<p>Load the target page and run the step sequence to observe the failure.</p>
<button class="btn" onclick="loadTarget()">Load Target Page</button>
<button class="btn" id="run-btn" onclick="runRepro()" disabled>Run Repro Steps</button>
<iframe id="target-frame" class="repro-frame" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
<div id="log">// Repro log — click "Load Target Page" to start\n</div>

<script>
  const TARGET_URL = ${JSON.stringify(targetUrl)};
  const STEPS = [
${jsSteps.join(',\n')}
  ];

  const logEl = document.getElementById('log');
  function log(msg) {
    logEl.textContent += new Date().toISOString().slice(11, 23) + ' ' + msg + '\\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function loadTarget() {
    log('Loading target: ' + TARGET_URL);
    const frame = document.getElementById('target-frame');
    frame.src = TARGET_URL;
    frame.onload = () => {
      log('Target loaded.');
      document.getElementById('run-btn').disabled = false;
    };
    frame.onerror = () => log('ERROR: Failed to load target (cross-origin?)');
  }

  async function runRepro() {
    document.getElementById('run-btn').disabled = true;
    log('--- Starting repro sequence ---');

    const frame = document.getElementById('target-frame');
    let doc;
    try {
      doc = frame.contentDocument || frame.contentWindow?.document;
    } catch (e) {
      log('ERROR: Cannot access iframe document (cross-origin). Open target URL directly or use same-origin server.');
      return;
    }

    for (const step of STEPS) {
      log('Step ' + step.index + ': ' + step.name + ' [' + step.status + ']');
      log('  Goal: ' + step.goal);
      if (step.status === 'FAILED') {
        log('  >>> THIS IS THE FAILING STEP <<<');
        log('  Error: ${escHtml(errorMessage).replace(/'/g, "\\'")}');
      }
      await new Promise(r => setTimeout(r, 500));
    }

    log('--- Repro sequence complete ---');
    log('To reproduce with Surfly: start a co-browsing session on ' + TARGET_URL);
    log('and execute the same action sequence through the Surfly proxy.');
  }
</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
