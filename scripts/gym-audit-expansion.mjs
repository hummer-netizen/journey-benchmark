#!/usr/bin/env node
/**
 * Gym Audit — Components 9-26 (Priority 6 + Sections 1-5 expansion).
 * Isolated per-component, 3 runs each.
 * Assigns ratings per expanded Stress Test Manifesto model.
 */
import { WebfuseMcpProvider } from '../dist/agents/webfuse-mcp.js';
import fs from 'fs';
import path from 'path';

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';
const RUNS = parseInt(process.env['AUDIT_RUNS'] ?? '3', 10);

const COMPONENTS = [
  // === Priority 6 ===
  {
    id: 'time-input',
    num: 9,
    name: 'Time Input (type=time)',
    category: 'Native Input',
    goal: `Navigate to ${GYM_URL}. Find section "9. Time Input" with a time input (type="time", id "gym-time") labelled "Select a time". Set it to 13:45. Verify the green status shows "Time selected: 13:45".`,
  },
  {
    id: 'datetime-local',
    num: 10,
    name: 'DateTime-Local Input',
    category: 'Native Input',
    goal: `Navigate to ${GYM_URL}. Find section "10. DateTime-Local Input" with a datetime-local input (id "gym-datetime") labelled "Select date and time". Set it to 2026-07-20T13:45. Verify the green status shows "DateTime selected: 2026-07-20T13:45".`,
  },
  {
    id: 'range-slider',
    num: 11,
    name: 'Range Slider',
    category: 'Native Input',
    goal: `Navigate to ${GYM_URL}. Find section "11. Range Slider" with a range input (id "gym-range") labelled "Set intensity (0-100)". Set its value to exactly 75 using either the slider or keyboard arrow keys. Verify the displayed value shows "75" and the green status shows "Intensity set to 75!".`,
  },
  {
    id: 'nested-shadow',
    num: 12,
    name: 'Nested Shadow Root',
    category: 'Shadow DOM',
    goal: `Navigate to ${GYM_URL}. Find section "12. Nested Shadow Root". There is an outer shadow host (blue border) containing an inner shadow host (yellow dashed border). Inside the inner shadow root there is a text input with placeholder "e.g. DEEP-42" and a "Confirm" button. Type "DEEP-42" into the input and click "Confirm". Verify the green status below shows "Nested confirmed: DEEP-42".`,
  },
  {
    id: 'closed-shadow',
    num: 13,
    name: 'Closed Shadow Root',
    category: 'Shadow DOM',
    goal: `Navigate to ${GYM_URL}. Find section "13. Closed Shadow Root" with a red-bordered component. Inside it there is an input with placeholder "Type here..." and a "Verify" button. This is a CLOSED shadow root. Type "SECRET-99" into the input and click "Verify". Verify the green status below shows "Closed verified: SECRET-99".`,
  },
  {
    id: 'dialog',
    num: 14,
    name: 'Dialog / Popover',
    category: 'Top Layer',
    goal: `Navigate to ${GYM_URL}. Find section "14. Dialog / Popover". Click the "Open Dialog" button to open a modal dialog. Inside the dialog, type "CONFIRM-OK" into the input labelled "Enter confirmation code" and click the green "Confirm" button. Verify the status shows "Dialog confirmed: CONFIRM-OK".`,
  },
  // === Section 1: Native Inputs (cont.) ===
  {
    id: 'color-picker',
    num: 15,
    name: 'Color Picker (type=color)',
    category: 'Native Input',
    goal: `Navigate to ${GYM_URL}. Find section "15. Color Picker" with a color input (type="color", id "gym-color") labelled "Pick a color". Set its value to #00ff88. Verify the preview swatch updates and the green status shows "Color set: #00ff88".`,
  },
  // === Section 1: Event Order ===
  {
    id: 'blur-validated',
    num: 16,
    name: 'Blur-Validated Input',
    category: 'Event Order',
    goal: `Navigate to ${GYM_URL}. Find section "16. Blur-Validated Input" with an input labelled "Enter your email (validated on blur)". Type "test@gym.com" into it. Then click somewhere else on the page (like the page title) to move focus away and trigger the blur event. Verify the green status shows "Valid email: test@gym.com". Important: validation ONLY fires when focus leaves the field.`,
  },
  {
    id: 'input-change',
    num: 17,
    name: 'Input vs Change Divergence',
    category: 'Event Order',
    goal: `Navigate to ${GYM_URL}. Find section "17. Input vs Change Divergence" with a text input (id "gym-inputchange") labelled "Type a value and then leave the field". Click on the input, type "EVENT-TEST" character by character, then click somewhere else on the page to trigger the change event. Verify both the "Input events" count and "Change events" count are greater than 0, and the green status shows "Both events fired".`,
  },
  {
    id: 'focus-trap',
    num: 18,
    name: 'Focus Trap / Keyboard Modal',
    category: 'Top Layer',
    goal: `Navigate to ${GYM_URL}. Find section "18. Focus Trap / Keyboard Modal". Click the "Open Focus Trap Dialog" button. A modal dialog opens with fields for "Name" and "Code". Type "Tester" in the Name field, then type "TRAP-77" in the Code field. Click the green "Confirm" button. Verify the status shows "Focus trap confirmed: TRAP-77".`,
  },
  // === Section 3: Shadow DOM (cont.) ===
  {
    id: 'slotted',
    num: 19,
    name: 'Slotted Interactive Content',
    category: 'Shadow DOM',
    goal: `Navigate to ${GYM_URL}. Find section "19. Slotted Interactive Content". It has a text input with placeholder "Type SLOT-OK" and a blue "Submit Slot" button. These are light-DOM elements slotted into a shadow host with a dotted green border. Type "SLOT-OK" into the input and click "Submit Slot". Verify the green status shows "Slotted submitted: SLOT-OK".`,
  },
  {
    id: 'delegates-focus',
    num: 20,
    name: 'DelegatesFocus Shadow Root',
    category: 'Shadow DOM',
    goal: `Navigate to ${GYM_URL}. Find section "20. DelegatesFocus Shadow Root" with a purple-bordered host area. Click anywhere on the purple-bordered host. Focus should automatically delegate to the inner input inside the shadow root. Type "FOCUS-88" into the focused input and click the "Submit" button inside the shadow. Verify the green status shows "DelegatesFocus confirmed: FOCUS-88".`,
  },
  // === Section 4: Custom Elements ===
  {
    id: 'form-associated',
    num: 21,
    name: 'Form-Associated Custom Element',
    category: 'Custom Element',
    goal: `Navigate to ${GYM_URL}. Find section "21. Form-Associated Custom Element" with a star rating component. Click the 4th star to set a rating of 4, then click the "Submit Form" button. Verify the green status shows "Form submitted with rating: 4".`,
  },
  {
    id: 'toggle',
    num: 22,
    name: 'Autonomous Toggle Component',
    category: 'Custom Element',
    goal: `Navigate to ${GYM_URL}. Find section "22. Autonomous Toggle Component" which shows a toggle element currently showing "OFF". Click it to toggle it ON. Verify the green status shows "Toggle is ON" and the element text changes to "ON".`,
  },
  {
    id: 'customized-builtin',
    num: 23,
    name: 'Customized Built-in Element',
    category: 'Custom Element',
    goal: `Navigate to ${GYM_URL}. Find section "23. Customized Built-in Element" with a button that says "Click me: 0". Click the button 3 times. Verify the button text shows "Click me: 3" and the green status shows "Counter reached 3 clicks!".`,
  },
  // === Section 5: Rendering/AX Gaps ===
  {
    id: 'svg-control',
    num: 24,
    name: 'SVG Composite Control',
    category: 'AX Gap',
    goal: `Navigate to ${GYM_URL}. Find section "24. SVG Composite Control" with an SVG containing two buttons: "Go" (green) and "Stop" (red). Click the green "Go" button inside the SVG. Verify the green status shows "SVG action: Go".`,
  },
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
  const timeouts = results.filter(r => r.status === 'TIMEOUT').length;
  if (passes === 0) return '❌ FAIL';
  if (passes < RUNS || results.some(r => r.status === 'PASS' && r.toolCalls >= 8)) return '⚠️ FLAKY';
  return '✅ PASS';
}

// Classify failures into expanded rating categories based on error patterns
function classifyFailure(results, component) {
  const errors = results.filter(r => r.error).map(r => r.error.toLowerCase());
  const joined = errors.join(' ');

  if (joined.includes('hover') || joined.includes('mouseenter') || joined.includes('mousemove'))
    return 'TOOL GAP';
  if (joined.includes('drag') || joined.includes('dnd'))
    return 'TOOL GAP';
  if (joined.includes('shadow') || joined.includes('pierce'))
    return 'AX GAP';
  if (joined.includes('event') || joined.includes('change') || joined.includes('blur') || joined.includes('input'))
    return 'EVENT GAP';
  if (joined.includes('color') || joined.includes('date') || joined.includes('time') || joined.includes('range'))
    return 'EVENT GAP';
  return null;
}

async function main() {
  console.log('=== Gym Audit: Components 9-26 (Expansion) ===');
  console.log(`Components: ${COMPONENTS.length}, Runs per component: ${RUNS}`);
  console.log(`Gym URL: ${GYM_URL}`);
  console.log('');

  const allResults = [];
  let portBase = 9300;

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

  // Generate markdown report
  const lines = [];
  lines.push('# Gym Audit: Components 9-26 (Expansion Benchmark)');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Provider:** WebfuseMcpProvider (Surfly co-browsing proxy, Anthropic Claude backend)`);
  lines.push(`**Gym URL:** ${GYM_URL}`);
  lines.push(`**Runs per component:** ${RUNS}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| # | Component | Category | Rating | Pass Rate | Avg Time | Avg Calls | Gap Type | Notes |');
  lines.push('|---|-----------|----------|--------|-----------|----------|-----------|----------|-------|');

  for (const c of COMPONENTS) {
    const cr = allResults.filter(r => r.componentId === c.id);
    const passes = cr.filter(r => r.status === 'PASS').length;
    const r = rating(cr);
    const avgTime = (cr.reduce((s, x) => s + x.timeMs, 0) / RUNS / 1000).toFixed(1) + 's';
    const avgCalls = (cr.reduce((s, x) => s + x.toolCalls, 0) / RUNS).toFixed(1);
    const gap = r.includes('FAIL') || r.includes('FLAKY') ? (classifyFailure(cr, c) || '-') : '-';
    const errs = cr.filter(x => x.error).map(x => x.error.slice(0, 80));
    const notes = errs.length > 0 ? errs[0] : '-';
    lines.push(`| ${c.num} | ${c.name} | ${c.category} | ${r} | ${passes}/${RUNS} | ${avgTime} | ${avgCalls} | ${gap} | ${notes} |`);
  }

  // Summary
  const totalPasses = COMPONENTS.filter(c => {
    const cr = allResults.filter(r => r.componentId === c.id);
    return rating(cr) === '✅ PASS';
  }).length;
  const totalFlaky = COMPONENTS.filter(c => {
    const cr = allResults.filter(r => r.componentId === c.id);
    return rating(cr).includes('FLAKY');
  }).length;
  const totalFail = COMPONENTS.filter(c => {
    const cr = allResults.filter(r => r.componentId === c.id);
    return rating(cr).includes('FAIL');
  }).length;

  lines.push('');
  lines.push(`## Summary: ${totalPasses} PASS / ${totalFlaky} FLAKY / ${totalFail} FAIL (out of ${COMPONENTS.length})`);
  lines.push('');
  lines.push('---');
  lines.push('> :medal: *I love it when a plan comes together.* - Hannibal, A-Team');

  const report = lines.join('\n');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(process.cwd(), 'reports', `gym-expansion-${ts}.md`);
  const jsonPath = reportPath.replace('.md', '.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));
  console.log(`\nReport: ${reportPath}`);
  console.log(`JSON:   ${jsonPath}`);
  console.log('\n' + report);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
