#!/usr/bin/env npx tsx
/**
 * Gym Component Audit — Isolated per-component benchmarks
 * Runs each J00 step individually via webfuse-mcp, 3 times each.
 * Produces a "Status of the Gym" diagnostic report.
 */

import { WebfuseMcpProvider } from '../src/agents/webfuse-mcp.js';

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';

// Component definitions matching J00 steps
const COMPONENTS = [
  {
    id: 'navigate',
    name: 'Navigate to The Gym',
    goal: `Navigate to the Journey 0 page at ${GYM_URL} and wait for the page title "Journey 0 — The Gym" to appear.`,
    category: 'Page Load',
  },
  {
    id: 'datepicker-text',
    name: 'DatePicker (type=text workaround)',
    goal: 'Find the date input labelled "Select a date" with placeholder "YYYY-MM-DD" and set it to 2026-06-15. Verify the status message shows "Date selected: 2026-06-15".',
    category: 'Input Fields',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
  {
    id: 'select-dropdown',
    name: 'Select / Dropdown',
    goal: 'Open the "Choose an exercise" dropdown (a <select> element) and select "Deadlift". Verify the status message confirms "Exercise selected: deadlift".',
    category: 'Selection',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
  {
    id: 'context-menu',
    name: 'Context Menu (Right-click)',
    goal: 'Right-click on the grey area labelled "Right-click here" to open the custom context menu, then click the "Edit" option (button with id "ctx-edit"). Verify the status message shows "Context action: edit".',
    category: 'Complex UI',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
  {
    id: 'clickable-image',
    name: 'Clickable SVG Image',
    goal: 'Click the blue SVG image (with id "img-blue", labelled "Blue equipment") to select it. Verify the status message confirms "Image selected: Blue equipment" and the image has a green border.',
    category: 'Complex UI',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
  {
    id: 'textarea',
    name: 'Textarea',
    goal: 'Click on the workout notes textarea (id "gym-notes") and type "3x5 deadlifts at 100kg, felt strong". Verify the status message shows the character count.',
    category: 'Input Fields',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
  {
    id: 'hover-state',
    name: 'Hover State',
    goal: 'Hover over the grey box that says "Hover over me" to reveal a hidden message and a button. Then click the "Claim Reward" button. Verify the status message shows "Reward claimed!".',
    category: 'Complex UI',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
  {
    id: 'shadow-dom',
    name: 'Shadow DOM',
    goal: 'Find the Shadow DOM component (section 7 with a dashed border). Inside it there is an input labelled "Membership ID" and a "Verify" button. Type "GYM-1234" into the input and click "Verify". Verify the status message below the component shows "Membership verified: GYM-1234".',
    category: 'The Blockers',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
  {
    id: 'native-date',
    name: 'Native Date Input (type=date)',
    goal: 'Find the native HTML5 date input labelled "Select workout date" (it has type="date", id "gym-native-date"). Set it to 2026-07-20. Verify the status message shows "Native date selected: 2026-07-20".',
    category: 'The Blockers',
    prereq: `First navigate to ${GYM_URL} and wait for the page to load.`,
  },
];

const RUNS = 3;
const MAX_TOOL_CALLS = 30; // Per-component limit

interface RunResult {
  componentId: string;
  run: number;
  status: 'PASS' | 'FAIL' | 'TIMEOUT';
  toolCalls: number;
  timeMs: number;
  error?: string;
  toolLog: string[];
}

async function runComponent(
  component: typeof COMPONENTS[0],
  runNum: number,
): Promise<RunResult> {
  const startTime = Date.now();
  const toolLog: string[] = [];
  let toolCalls = 0;

  try {
    // Create a fresh provider/session for each component run
    const provider = new WebfuseMcpProvider();
    await provider.init();

    // Navigate first if prereq
    const fullGoal = component.prereq
      ? `${component.prereq}\n\nThen: ${component.goal}`
      : component.goal;

    // Hook into tool call logging
    const originalExecuteGoal = provider.executeGoal.bind(provider);

    const result = await Promise.race([
      provider.executeGoal(null as any, fullGoal),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT: exceeded 120s')), 120_000)
      ),
    ]);

    const timeMs = Date.now() - startTime;
    await provider.cleanup?.();

    return {
      componentId: component.id,
      run: runNum,
      status: 'PASS',
      toolCalls,
      timeMs,
      toolLog,
    };
  } catch (err: any) {
    const timeMs = Date.now() - startTime;
    const isTimeout = err.message?.includes('TIMEOUT');
    return {
      componentId: component.id,
      run: runNum,
      status: isTimeout ? 'TIMEOUT' : 'FAIL',
      toolCalls,
      timeMs,
      error: err.message?.slice(0, 300),
      toolLog,
    };
  }
}

async function main() {
  console.log('=== Gym Component Audit ===');
  console.log(`Components: ${COMPONENTS.length}`);
  console.log(`Runs per component: ${RUNS}`);
  console.log(`Max tool calls per run: ${MAX_TOOL_CALLS}`);
  console.log('');

  const allResults: RunResult[] = [];

  for (const component of COMPONENTS) {
    console.log(`\n--- ${component.name} (${component.category}) ---`);
    for (let run = 1; run <= RUNS; run++) {
      console.log(`  Run ${run}/${RUNS}...`);
      const result = await runComponent(component, run);
      allResults.push(result);
      console.log(`  → ${result.status} (${(result.timeMs / 1000).toFixed(1)}s, ${result.toolCalls} calls)${result.error ? ' ERROR: ' + result.error.slice(0, 100) : ''}`);
    }
  }

  // Generate report
  const report = generateReport(allResults);
  console.log('\n\n' + report);

  // Write to file
  const reportPath = `${process.cwd()}/reports/gym-status-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;
  const fs = await import('fs');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport written to: ${reportPath}`);
}

function generateReport(results: RunResult[]): string {
  const lines: string[] = [];
  lines.push('# Status of the Gym — J00 Component Diagnostic Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Runs per component:** ${RUNS}`);
  lines.push(`**Provider:** WebfuseMcpProvider (Surfly co-browsing proxy)`);
  lines.push(`**Gym URL:** ${GYM_URL}`);
  lines.push('');
  lines.push('## Rating Criteria');
  lines.push('- **PASS**: Works in <4 tool call attempts across all runs');
  lines.push('- **FLAKY**: Works but requires 4+ attempts in any run');
  lines.push('- **FAIL**: 0% success rate across all runs');
  lines.push('');
  lines.push('## Component Breakdown');
  lines.push('');
  lines.push('| # | Component | Category | Rating | Pass Rate | Avg Time | Avg Tool Calls | Notes |');
  lines.push('|---|-----------|----------|--------|-----------|----------|----------------|-------|');

  for (const component of COMPONENTS) {
    const compResults = results.filter(r => r.componentId === component.id);
    const passes = compResults.filter(r => r.status === 'PASS').length;
    const passRate = `${passes}/${RUNS}`;
    const avgTime = (compResults.reduce((s, r) => s + r.timeMs, 0) / RUNS / 1000).toFixed(1) + 's';
    const avgCalls = (compResults.reduce((s, r) => s + r.toolCalls, 0) / RUNS).toFixed(1);

    let rating: string;
    if (passes === 0) {
      rating = '❌ FAIL';
    } else if (passes < RUNS || compResults.some(r => r.toolCalls >= 4)) {
      rating = '⚠️ FLAKY';
    } else {
      rating = '✅ PASS';
    }

    const errors = compResults.filter(r => r.error).map(r => r.error!.slice(0, 80));
    const notes = errors.length > 0 ? errors[0] : '—';

    lines.push(`| ${COMPONENTS.indexOf(component) + 1} | ${component.name} | ${component.category} | ${rating} | ${passRate} | ${avgTime} | ${avgCalls} | ${notes} |`);
  }

  // Detailed failures
  const failures = results.filter(r => r.status !== 'PASS');
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failures & Flaky Details');
    lines.push('');
    for (const f of failures) {
      const comp = COMPONENTS.find(c => c.id === f.componentId)!;
      lines.push(`### ${comp.name} — Run ${f.run}: ${f.status}`);
      lines.push(`- **Time:** ${(f.timeMs / 1000).toFixed(1)}s`);
      lines.push(`- **Tool calls:** ${f.toolCalls}`);
      if (f.error) lines.push(`- **Error:** \`${f.error}\``);
      lines.push('');
    }
  }

  // Audit section for specifically requested components
  lines.push('## Specific Audit: Requested Components');
  lines.push('');
  const auditTargets = [
    { id: 'native-date', name: 'Native Date Inputs (type=date)', note: 'The real HTML5 date input — the known blocker. Component 1 uses a type=text workaround.' },
    { id: 'shadow-dom', name: 'Shadow DOM', note: 'Input + button inside an open shadow root.' },
    { id: 'select-dropdown', name: 'Select/Dropdowns', note: 'Native <select> element with 5 options.' },
    { id: 'hover-state', name: 'Hover States', note: 'CSS :hover reveals hidden content; agent must hover then click.' },
  ];
  for (const audit of auditTargets) {
    const compResults = results.filter(r => r.componentId === audit.id);
    const passes = compResults.filter(r => r.status === 'PASS').length;
    lines.push(`### ${audit.name}`);
    lines.push(`- **Pass rate:** ${passes}/${RUNS}`);
    lines.push(`- **Description:** ${audit.note}`);
    if (compResults.some(r => r.error)) {
      lines.push(`- **Errors:** ${compResults.filter(r => r.error).map(r => r.error!.slice(0, 150)).join('; ')}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('> 🎖️ *I love it when a plan comes together.* — Hannibal, A-Team');

  return lines.join('\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
