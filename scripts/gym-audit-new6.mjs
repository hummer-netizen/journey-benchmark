#!/usr/bin/env node
/**
 * Gym Audit — NEW 6 Priority components only.
 * Isolated per-component, 3 runs each.
 */
import { WebfuseMcpProvider } from '../dist/agents/webfuse-mcp.js';
import fs from 'fs';
import path from 'path';

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';
const RUNS = 3;

const COMPONENTS = [
  {
    id: 'time-input',
    name: 'Time Input (type=time)',
    category: 'Native Inputs',
    goal: `Navigate to ${GYM_URL}. Find section "9. Time Input" with a time input (type="time", id "gym-time") labelled "Select a time". Set it to 13:45. Verify the status shows "Time selected: 13:45".`,
  },
  {
    id: 'datetime-local',
    name: 'DateTime-Local Input',
    category: 'Native Inputs',
    goal: `Navigate to ${GYM_URL}. Find section "10. DateTime-Local Input" with a datetime-local input (id "gym-datetime") labelled "Select date and time". Set it to 2026-07-20T13:45. Verify the status shows "DateTime selected: 2026-07-20T13:45".`,
  },
  {
    id: 'range-slider',
    name: 'Range Slider',
    category: 'Native Inputs',
    goal: `Navigate to ${GYM_URL}. Find section "11. Range Slider" with a range input (id "gym-range") labelled "Set intensity (0-100)". Set its value to exactly 75 using either the slider or keyboard arrow keys. Verify the displayed value shows "75" and the status shows "Intensity set to 75!".`,
  },
  {
    id: 'nested-shadow',
    name: 'Nested Shadow Root',
    category: 'Shadow DOM',
    goal: `Navigate to ${GYM_URL}. Find section "12. Nested Shadow Root". There is an outer shadow host (blue border) containing an inner shadow host (yellow dashed border). Inside the inner host there is a text input with placeholder "e.g. DEEP-42" and a "Confirm" button. Type "DEEP-42" into the input and click "Confirm". Verify the status below shows "Nested confirmed: DEEP-42".`,
  },
  {
    id: 'closed-shadow',
    name: 'Closed Shadow Root',
    category: 'Shadow DOM',
    goal: `Navigate to ${GYM_URL}. Find section "13. Closed Shadow Root" which has a red-bordered component. Inside it there is an input with placeholder "Type here..." and a "Verify" button. This is a CLOSED shadow root (shadowRoot is null). Type "SECRET-99" into the input and click "Verify". Verify the status below shows "Closed verified: SECRET-99".`,
  },
  {
    id: 'dialog-popover',
    name: 'Dialog / Popover',
    category: 'Top Layer',
    goal: `Navigate to ${GYM_URL}. Find section "14. Dialog / Popover". Click the "Open Dialog" button to open a modal dialog. Inside the dialog, type "CONFIRM-OK" into the input labelled "Enter confirmation code" and click the green "Confirm" button. Verify the status message shows "Dialog confirmed: CONFIRM-OK".`,
  },
];

async function runOne(component, runNum, proxyPort) {
  const start = Date.now();
  let provider;
  let toolCalls = 0;
  try {
    provider = new WebfuseMcpProvider(true, proxyPort);
    const page = await provider.openUrl(GYM_URL);
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
    console.log = console.log; // restore if needed
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
  if (passes < RUNS || results.some(r => r.status === 'PASS' && r.toolCalls >= 8)) return '⚠️ FLAKY';
  return '✅ PASS';
}

async function main() {
  console.log('=== Gym Audit: NEW 6 Priority Components ===');
  console.log(`Components: ${COMPONENTS.length}, Runs: ${RUNS}`);

  const allResults = [];
  let portBase = 9200;

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

  // Generate report
  const lines = [];
  lines.push('# Gym Audit: Priority 6 Components — Initial Benchmark');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Provider:** WebfuseMcpProvider`);
  lines.push(`**Runs per component:** ${RUNS}`);
  lines.push('');
  lines.push('| # | Component | Category | Rating | Pass Rate | Avg Time | Avg Calls | Notes |');
  lines.push('|---|-----------|----------|--------|-----------|----------|-----------|-------|');

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

  const report = lines.join('\n');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(process.cwd(), 'reports', `gym-p6-${ts}.md`);
  const jsonPath = reportPath.replace('.md', '.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));
  console.log(`\nReport: ${reportPath}`);
  console.log('\n' + report);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
