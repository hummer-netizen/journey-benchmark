#!/usr/bin/env node
/**
 * Gym Component Audit — Isolated per-component benchmarks.
 * Each component gets its own fresh Webfuse session (no cascading failures).
 * 3 runs per component. Outputs markdown report.
 */
import { WebfuseMcpProvider } from '../dist/agents/webfuse-mcp.js';
import fs from 'fs';
import path from 'path';

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';
const RUNS = 3;

const COMPONENTS = [
  {
    id: 'navigate',
    name: 'Navigate / Page Load',
    category: 'Page Load',
    goal: `Navigate to ${GYM_URL} and confirm the heading "Journey 0 — The Gym" is visible.`,
  },
  {
    id: 'datepicker-text',
    name: 'DatePicker (type=text)',
    category: 'Input Fields',
    goal: `Navigate to ${GYM_URL}. Find the text input with placeholder "YYYY-MM-DD" labelled "Select a date" and type "2026-06-15" into it. Verify the green status message shows "Date selected: 2026-06-15".`,
  },
  {
    id: 'select-dropdown',
    name: 'Select / Dropdown',
    category: 'Selection',
    goal: `Navigate to ${GYM_URL}. Find the dropdown labelled "Choose an exercise" and select "Deadlift". Verify the green status shows "Exercise selected: deadlift".`,
  },
  {
    id: 'context-menu',
    name: 'Context Menu (Right-click)',
    category: 'Complex UI',
    goal: `Navigate to ${GYM_URL}. Right-click on the grey area that says "Right-click here" to open the custom context menu. Then click the "Edit" menu item. Verify the status shows "Context action: edit".`,
  },
  {
    id: 'clickable-image',
    name: 'Clickable SVG Image',
    category: 'Complex UI',
    goal: `Navigate to ${GYM_URL}. Click the blue colored SVG image (id "img-blue") to select it. Verify the status shows "Image selected: Blue equipment".`,
  },
  {
    id: 'textarea',
    name: 'Textarea',
    category: 'Input Fields',
    goal: `Navigate to ${GYM_URL}. Find the textarea labelled "Workout notes" and type "3x5 deadlifts at 100kg". Verify the status shows a character count.`,
  },
  {
    id: 'hover-state',
    name: 'Hover State',
    category: 'Complex UI',
    goal: `Navigate to ${GYM_URL}. Hover over the grey box that says "Hover over me" to reveal hidden content. Then click the "Claim Reward" button that appears. Verify the status shows "Reward claimed!".`,
  },
  {
    id: 'shadow-dom',
    name: 'Shadow DOM',
    category: 'The Blockers',
    goal: `Navigate to ${GYM_URL}. Find section "7. Shadow DOM" which contains a shadow DOM component with a dashed border. Inside the shadow root there is an input with placeholder "e.g. GYM-1234" and a "Verify" button. Type "GYM-1234" into the input and click "Verify". Verify the status below shows "Membership verified: GYM-1234".`,
  },
  {
    id: 'native-date',
    name: 'Native Date Input (type=date)',
    category: 'The Blockers',
    goal: `Navigate to ${GYM_URL}. Find section "8. Native Date Input" which has a real HTML5 date input (type="date") labelled "Select workout date". Set it to 2026-07-20. Verify the status shows "Native date selected: 2026-07-20".`,
  },
];

async function runOne(component, runNum, proxyPort) {
  const start = Date.now();
  let provider;
  let toolCalls = 0;
  try {
    provider = new WebfuseMcpProvider(true, proxyPort);
    const page = await provider.openUrl(GYM_URL);

    // Intercept console to count tool calls
    const origLog = console.log;
    console.log = (...args) => {
      const msg = args.join(' ');
      if (msg.includes('[Agent] Tool:')) toolCalls++;
      origLog(...args);
    };

    await Promise.race([
      provider.executeGoal(page, component.goal),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_120s')), 120000)),
    ]);

    console.log = origLog;
    await provider.close().catch(() => {});
    return { status: 'PASS', toolCalls, timeMs: Date.now() - start, error: null };
  } catch (err) {
    const origLog = console.log;
    if (typeof console.log !== 'function') console.log = origLog;
    else console.log = origLog;
    try { await provider?.close(); } catch {}
    return {
      status: err.message?.includes('TIMEOUT') ? 'TIMEOUT' : 'FAIL',
      toolCalls,
      timeMs: Date.now() - start,
      error: String(err.message || err).slice(0, 300),
    };
  }
}

function rating(results) {
  const passes = results.filter(r => r.status === 'PASS').length;
  if (passes === 0) return '❌ FAIL';
  const highCalls = results.some(r => r.status === 'PASS' && r.toolCalls >= 8);
  if (passes < RUNS || highCalls) return '⚠️ FLAKY';
  return '✅ PASS';
}

function generateReport(allResults) {
  const lines = [];
  lines.push('# Status of the Gym — J00 Component Diagnostic Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Provider:** WebfuseMcpProvider (Surfly co-browsing proxy, Anthropic Claude backend)`);
  lines.push(`**Gym URL:** ${GYM_URL}`);
  lines.push(`**Runs per component:** ${RUNS}`);
  lines.push(`**Methodology:** Each component tested in an isolated Webfuse session (no cascading failures)`);
  lines.push('');
  lines.push('## Rating Criteria');
  lines.push('- **PASS**: Succeeds in all runs with <8 tool calls per run');
  lines.push('- **FLAKY**: Succeeds sometimes, or needs 8+ tool calls (excessive retries)');
  lines.push('- **FAIL**: 0% success rate across all runs');
  lines.push('');
  lines.push('## Component Breakdown');
  lines.push('');
  lines.push('| # | Component | Category | Rating | Pass Rate | Avg Time | Avg Tool Calls | Notes |');
  lines.push('|---|-----------|----------|--------|-----------|----------|----------------|-------|');

  for (let i = 0; i < COMPONENTS.length; i++) {
    const c = COMPONENTS[i];
    const cr = allResults.filter(r => r.componentId === c.id);
    const passes = cr.filter(r => r.status === 'PASS').length;
    const r = rating(cr);
    const avgTime = (cr.reduce((s, x) => s + x.timeMs, 0) / RUNS / 1000).toFixed(1) + 's';
    const avgCalls = (cr.reduce((s, x) => s + x.toolCalls, 0) / RUNS).toFixed(1);
    const errs = cr.filter(x => x.error).map(x => x.error.slice(0, 80));
    const notes = errs.length > 0 ? errs[0] : '—';
    lines.push(`| ${i + 1} | ${c.name} | ${c.category} | ${r} | ${passes}/${RUNS} | ${avgTime} | ${avgCalls} | ${notes} |`);
  }

  // Failures detail
  const failures = allResults.filter(r => r.status !== 'PASS');
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failure & Flaky Details');
    lines.push('');
    for (const f of failures) {
      const c = COMPONENTS.find(x => x.id === f.componentId);
      lines.push(`### ${c.name} — Run ${f.run}: ${f.status}`);
      lines.push(`- **Time:** ${(f.timeMs / 1000).toFixed(1)}s`);
      lines.push(`- **Tool calls:** ${f.toolCalls}`);
      if (f.error) lines.push(`- **Error:** \`${f.error}\``);
      lines.push('');
    }
  }

  // Specific audit
  lines.push('## Specific Audit: Requested Components');
  lines.push('');
  const audits = [
    { id: 'native-date', label: 'Native Date Inputs (type=date)', note: 'Real HTML5 date input — the known Surfly proxy blocker. Component 1 uses type=text workaround.' },
    { id: 'shadow-dom', label: 'Shadow DOM', note: 'Input + button inside an open shadow root with scoped styles.' },
    { id: 'select-dropdown', label: 'Select/Dropdowns', note: 'Native <select> with 5 <option> elements.' },
    { id: 'hover-state', label: 'Hover States', note: 'CSS :hover reveals hidden content; agent must hover then click revealed button.' },
  ];
  for (const a of audits) {
    const cr = allResults.filter(r => r.componentId === a.id);
    const passes = cr.filter(r => r.status === 'PASS').length;
    const r = rating(cr);
    lines.push(`### ${a.label}`);
    lines.push(`- **Rating:** ${r}`);
    lines.push(`- **Pass rate:** ${passes}/${RUNS}`);
    lines.push(`- **Description:** ${a.note}`);
    if (cr.some(x => x.error)) {
      lines.push(`- **Errors:** ${cr.filter(x => x.error).map(x => x.error.slice(0, 200)).join('; ')}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('> 🎖️ *I love it when a plan comes together.* — Hannibal, A-Team');
  return lines.join('\n');
}

async function main() {
  console.log('=== Gym Component Audit (Isolated) ===');
  console.log(`Components: ${COMPONENTS.length}, Runs: ${RUNS}`);

  const allResults = [];
  let portBase = 9100; // Avoid 8999 conflicts

  for (const component of COMPONENTS) {
    console.log(`\n--- ${component.id} (${component.category}) ---`);
    for (let run = 1; run <= RUNS; run++) {
      const port = portBase++;
      console.log(`  Run ${run}/${RUNS} (proxy port ${port})...`);
      const result = await runOne(component, run, port);
      result.componentId = component.id;
      result.run = run;
      allResults.push(result);
      console.log(`  → ${result.status} (${(result.timeMs/1000).toFixed(1)}s, ${result.toolCalls} calls)${result.error ? ' ERR: '+result.error.slice(0,80) : ''}`);
    }
  }

  const report = generateReport(allResults);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(process.cwd(), 'reports', `gym-status-${ts}.md`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport: ${reportPath}`);

  // Also write JSON for downstream
  const jsonPath = reportPath.replace('.md', '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));

  console.log('\n' + report);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
