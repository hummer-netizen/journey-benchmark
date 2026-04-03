#!/usr/bin/env npx tsx
/**
 * Verify the 2 fixable FLAKY components after c896703 + d8e3770:
 * 1. Hover State (now has hover tool)
 * 2. DatePicker (type=text) (prompt tightened)
 * Also verify SVG click didn't regress.
 */
import { WebfuseMcpProvider } from '../src/agents/webfuse-mcp.js';

const GYM_URL = process.env['GYM_URL'] ?? 'https://gym-diagnostic.webfuse.it';

const TESTS = [
  {
    name: 'DatePicker (type=text)',
    goal: `First navigate to ${GYM_URL} and wait for the page to load.\n\nThen: Find the date input labelled "Select a date" with placeholder "YYYY-MM-DD" (id="gym-date") and set it to 2026-06-15. Verify the status message shows "Date selected: 2026-06-15".`,
  },
  {
    name: 'Clickable SVG Image',
    goal: `First navigate to ${GYM_URL} and wait for the page to load.\n\nThen: Click the blue SVG image (with id "img-blue", labelled "Blue equipment") to select it. Verify the status message confirms "Image selected: Blue equipment" and the image has a green border.`,
  },
  {
    name: 'Hover State',
    goal: `First navigate to ${GYM_URL} and wait for the page to load.\n\nThen: Hover over the grey box that says "Hover over me" (id="gym-hover-area") to reveal a hidden message and a button. Then click the "Claim Reward" button (id="hover-action-btn"). Verify the status message shows "Reward claimed!".`,
  },
];

async function runTest(test: typeof TESTS[0]): Promise<{name: string; status: string; timeMs: number; error?: string}> {
  const start = Date.now();
  const provider = new WebfuseMcpProvider(true, 8999 + Math.floor(Math.random() * 100));
  try {
    // Need to open a URL first to get a page/session
    const page = await provider.openUrl(GYM_URL);
    await provider.executeGoal(page, test.goal);
    await provider.close();
    return { name: test.name, status: 'PASS', timeMs: Date.now() - start };
  } catch (err: any) {
    try { await provider.close(); } catch {}
    return { name: test.name, status: 'FAIL', timeMs: Date.now() - start, error: err.message?.slice(0, 300) };
  }
}

async function main() {
  console.log('=== Verify Fixes (c896703 + d8e3770) ===\n');
  
  for (const test of TESTS) {
    console.log(`Running: ${test.name}...`);
    const result = await runTest(test);
    const emoji = result.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${emoji} ${result.status} (${(result.timeMs / 1000).toFixed(1)}s)${result.error ? ' — ' + result.error.slice(0, 100) : ''}\n`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
