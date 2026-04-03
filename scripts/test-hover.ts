#!/usr/bin/env npx tsx
import { WebfuseMcpProvider } from '../src/agents/webfuse-mcp.js';
const GYM = 'https://gym-diagnostic.webfuse.it';
async function main() {
  const provider = new WebfuseMcpProvider(true, 9050);
  const page = await provider.openUrl(GYM);
  const start = Date.now();
  await provider.executeGoal(page, `First navigate to ${GYM} and wait for the page to load.\n\nThen: Hover over the grey box that says "Hover over me" (id="gym-hover-area") to reveal a hidden message and a button. Then click the "Claim Reward" button (id="hover-action-btn"). Verify the status message shows "Reward claimed!".`);
  console.log(`\n✅ PASS (${((Date.now()-start)/1000).toFixed(1)}s)`);
  await provider.close();
}
main().catch(e => { console.error('❌ FAIL:', e.message); process.exit(1); });
