#!/usr/bin/env node
/**
 * Gym Audit — Re-run for Canvas Widget (#25) and Drag and Drop (#26) only.
 */
import { WebfuseMcpProvider } from '../dist/agents/webfuse-mcp.js';
import fs from 'fs';
import path from 'path';

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';
const RUNS = 3;

const COMPONENTS = [
  {
    id: 'canvas-widget',
    num: 25,
    name: 'Canvas-backed Widget',
    category: 'AX Gap',
    goal: `Navigate to ${GYM_URL}. Find section "25. Canvas-backed Widget" with a canvas gauge. Find the number input labelled "Gauge value (0-100)" and clear it, then type "75". Click the "Set" button. Verify the green status shows "Canvas gauge set to 75%".`,
  },
  {
    id: 'drag-drop',
    num: 26,
    name: 'Drag and Drop',
    category: 'Complex UI',
    goal: `Navigate to ${GYM_URL}. Find section "26. Drag and Drop". Drag the blue "Drag me" box into the dashed "Drop here" zone. Verify the green status shows "Drag and drop completed!" and the drop zone text changes to "Dropped!".`,
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
    try { console.log = console.log; } catch {}
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
  console.log('=== Gym Re-Audit: Canvas Widget + Drag and Drop ===');
  const allResults = [];
  let portBase = 9400;

  for (const component of COMPONENTS) {
    console.log(`\n--- #${component.num} ${component.id} (${component.category}) ---`);
    for (let run = 1; run <= RUNS; run++) {
      const port = portBase++;
      console.log(`  Run ${run}/${RUNS} (proxy port ${port})...`);
      const result = await runOne(component, run, port);
      result.componentId = component.id;
      result.componentNum = component.num;
      result.run = run;
      allResults.push(result);
      console.log(`  -> ${result.status} (${(result.timeMs/1000).toFixed(1)}s, ${result.toolCalls} calls)${result.error ? ' ERR: '+result.error.slice(0,80) : ''}`);
    }
  }

  for (const c of COMPONENTS) {
    const cr = allResults.filter(r => r.componentId === c.id);
    const passes = cr.filter(r => r.status === 'PASS').length;
    console.log(`\n${c.name}: ${rating(cr)} (${passes}/${RUNS})`);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(process.cwd(), 'reports', `gym-rerun-${ts}.json`);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));
  console.log(`\nJSON: ${jsonPath}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
