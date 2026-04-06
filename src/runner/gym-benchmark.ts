import type { Page } from 'playwright';
import type { AutomationProvider } from '../webfuse/provider.js';
import type { GoalAwareProvider } from '../types.js';
import { J00TheGym } from '../journeys/j00-the-gym.js';
import { WebfuseAgent } from '../agents/webfuse-agent.js';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComponentResult {
  component: string;
  componentNum: number;
  mode: string;
  run: number;
  status: 'PASS' | 'FAIL';
  timeMs: number;
  toolCalls: number;
  turnCount: number;
  tokensIn: number;
  tokensOut: number;
  statusText: string | null;
  error: string | null;
  timestamp: string;
  sessionId?: string;
}

export interface GymBenchmarkOptions {
  mode: string;
  provider: AutomationProvider;
  gymUrl: string;
  runs: number;
  outputDir: string;
  diagnostic?: boolean;
}

// Safety caps per v9 plan
const CAPS = {
  turnCount: 15,
  tokenTotal: 50000,
  timeoutScripted: 10000,   // 10s for M1/M3
  timeoutAgentic: 120000,   // 120s for M2, 180s for M4
  timeoutAgenticWf: 180000, // 180s for M4
};

// Component IDs matching J00 step names (skip step 0 Navigate and last step Submit)
const COMPONENT_MAP: { num: number; id: string; stepName: string }[] = [
  { num: 1, id: 'datepicker', stepName: 'DatePicker' },
  { num: 2, id: 'select', stepName: 'Select' },
  { num: 3, id: 'contextmenu', stepName: 'ContextMenu' },
  { num: 4, id: 'image', stepName: 'ClickableImage' },
  { num: 5, id: 'textarea', stepName: 'Textarea' },
  { num: 6, id: 'hover', stepName: 'HoverState' },
  { num: 7, id: 'shadow', stepName: 'ShadowDOM' },
  { num: 8, id: 'native-date', stepName: 'NativeDate' },
  { num: 9, id: 'time', stepName: 'TimeInput' },
  { num: 10, id: 'datetime', stepName: 'DateTimeLocal' },
  { num: 11, id: 'range', stepName: 'RangeSlider' },
  { num: 12, id: 'nested-shadow', stepName: 'NestedShadow' },
  { num: 13, id: 'closed-shadow', stepName: 'ClosedShadow' },
  { num: 14, id: 'dialog', stepName: 'Dialog' },
  { num: 15, id: 'color', stepName: 'ColorPicker' },
  { num: 16, id: 'blur', stepName: 'BlurValidated' },
  { num: 17, id: 'inputchange', stepName: 'InputChange' },
  { num: 18, id: 'focustrap', stepName: 'FocusTrap' },
  { num: 19, id: 'slotted', stepName: 'SlottedContent' },
  { num: 20, id: 'delegatesfocus', stepName: 'DelegatesFocus' },
  { num: 21, id: 'formassoc', stepName: 'FormAssociated' },
  { num: 22, id: 'toggle', stepName: 'Toggle' },
  { num: 23, id: 'custombuiltin', stepName: 'CustomizedBuiltin' },
  { num: 24, id: 'svg', stepName: 'SVGControl' },
  { num: 25, id: 'canvas', stepName: 'CanvasWidget' },
  { num: 26, id: 'dnd', stepName: 'DragDrop' },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export class GymBenchmarkRunner {
  private options: GymBenchmarkOptions;

  constructor(options: GymBenchmarkOptions) {
    this.options = options;
  }

  async run(): Promise<ComponentResult[]> {
    const { mode, provider, gymUrl, runs, outputDir } = this.options;
    const allResults: ComponentResult[] = [];
    const isAgentic = mode === 'M2' || mode === 'M4';
    const isGoalProvider = isAgentic && typeof (provider as any).executeGoal === 'function';
    const timeout = mode === 'M4' ? CAPS.timeoutAgenticWf : isAgentic ? CAPS.timeoutAgentic : CAPS.timeoutScripted;

    // Build J00 steps
    const gym = new J00TheGym({ baseUrl: gymUrl });
    const steps = gym.steps;
    // steps[0] = Navigate, steps[1..26] = components, steps[27] = Submit
    const navStep = steps[0]!;
    const componentSteps = steps.slice(1, 27); // 26 components

    console.log(`\n=== Gym Benchmark: ${mode} (${runs} runs) ===`);

    for (let run = 1; run <= runs; run++) {
      console.log(`\n--- Run ${run}/${runs} ---`);

      let page: Page;
      try {
        page = await provider.openUrl(gymUrl);
      } catch (err) {
        console.error(`  Failed to open page: ${err instanceof Error ? err.message : err}`);
        // Record FAIL for all components in this run
        for (const comp of COMPONENT_MAP) {
          allResults.push({
            component: comp.id,
            componentNum: comp.num,
            mode,
            run,
            status: 'FAIL',
            timeMs: 0,
            toolCalls: 0,
            turnCount: 0,
            tokensIn: 0,
            tokensOut: 0,
            statusText: null,
            error: `Provider openUrl failed: ${err instanceof Error ? err.message : err}`,
            timestamp: new Date().toISOString(),
          });
        }
        continue;
      }

      // Navigate to gym page
      try {
        if (isGoalProvider) {
          await (provider as any as GoalAwareProvider).executeGoal(page, navStep.goal!);
        } else {
          await navStep.execute(page);
        }
        console.log(`  Navigated to Gym`);
      } catch (err) {
        console.error(`  Navigation failed: ${err instanceof Error ? err.message : err}`);
        for (const comp of COMPONENT_MAP) {
          allResults.push({
            component: comp.id, componentNum: comp.num, mode, run,
            status: 'FAIL', timeMs: 0, toolCalls: 0, turnCount: 0, tokensIn: 0, tokensOut: 0,
            statusText: null, error: `Navigation failed`, timestamp: new Date().toISOString(),
          });
        }
        await provider.close().catch(() => {});
        continue;
      }

      // Execute each component independently
      for (let i = 0; i < componentSteps.length; i++) {
        const step = componentSteps[i]!;
        const comp = COMPONENT_MAP[i]!;
        const start = Date.now();

        let status: 'PASS' | 'FAIL' = 'FAIL';
        let error: string | null = null;
        let statusText: string | null = null;
        let tokensIn = 0, tokensOut = 0, turnCount = 0, toolCalls = 0;

        try {
          if (isGoalProvider && step.goal) {
            // Agentic: create a fresh agent per component to track tokens
            const agent = new WebfuseAgent(page, 0, {
              maxIterations: CAPS.turnCount,
              automationApi: (provider as any).webfuse?.getAutomationApi?.() ?? (provider as any).getAutomationApi?.() ?? undefined,
              sessionId: (provider as any).webfuse?.getActiveSessionId?.() ?? (provider as any).getActiveSessionId?.() ?? undefined,
            });

            await Promise.race([
              agent.executeGoal(step.goal),
              new Promise((_, rej) => setTimeout(() => rej(new Error(`CAP_EXCEEDED: timeout=${timeout}ms`)), timeout)),
            ]);

            // Read token counters from the agent
            tokensIn = agent.tokensIn;
            tokensOut = agent.tokensOut;
            turnCount = agent.turnCount;
            toolCalls = agent.toolCallCount;
          } else {
            // Scripted execution with timeout
            await Promise.race([
              step.execute(page),
              new Promise((_, rej) => setTimeout(() => rej(new Error(`CAP_EXCEEDED: timeout=${timeout}ms`)), timeout)),
            ]);
          }
          status = 'PASS';
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          if (error.length > 200) error = error.slice(0, 200);
        }

        // Read status text from page if possible
        try {
          const statusId = `#${comp.id}-status`;
          statusText = await page.textContent(statusId).catch(() => null) as string | null;
        } catch {}

        const timeMs = Date.now() - start;
        const result: ComponentResult = {
          component: comp.id,
          componentNum: comp.num,
          mode,
          run,
          status,
          timeMs,
          toolCalls,
          turnCount,
          tokensIn,
          tokensOut,
          statusText,
          error,
          timestamp: new Date().toISOString(),
        };

        allResults.push(result);
        const tokenInfo = isAgentic ? ` [${turnCount}t, ${tokensIn + tokensOut}tok]` : '';
        console.log(`  ${comp.num}. ${comp.id}: ${status} (${timeMs}ms)${tokenInfo}${error ? ' ERR: ' + error.slice(0, 60) : ''}`);
      }

      // Close provider between runs (creates fresh session)
      await provider.close().catch(() => {});
    }

    // Write evidence files
    this.writeEvidence(allResults);
    return allResults;
  }

  private writeEvidence(results: ComponentResult[]): void {
    const { mode, outputDir } = this.options;
    fs.mkdirSync(outputDir, { recursive: true });

    // JSON
    const jsonPath = path.join(outputDir, `${mode.toLowerCase()}-components.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\n  Evidence: ${jsonPath}`);

    // CSV
    const csvPath = path.join(outputDir, `${mode.toLowerCase()}-components.csv`);
    const header = 'component,componentNum,mode,run,status,timeMs,toolCalls,turnCount,tokensIn,tokensOut,statusText,error';
    const rows = results.map(r =>
      `${r.component},${r.componentNum},${r.mode},${r.run},${r.status},${r.timeMs},${r.toolCalls},${r.turnCount},${r.tokensIn},${r.tokensOut},"${(r.statusText ?? '').replace(/"/g, '""')}","${(r.error ?? '').replace(/"/g, '""')}"`
    );
    fs.writeFileSync(csvPath, [header, ...rows].join('\n'));
    console.log(`  Evidence: ${csvPath}`);

    // Summary markdown
    const mdPath = path.join(outputDir, `${mode.toLowerCase()}-summary.md`);
    const lines: string[] = [];
    lines.push(`# ${mode} Component Results`);
    lines.push('');
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Runs:** ${this.options.runs}`);
    lines.push('');
    lines.push('| # | Component | Pass Rate | Median Time | Avg Calls | Avg Turns | Avg Tokens |');
    lines.push('|---|-----------|-----------|-------------|-----------|-----------|------------|');

    for (const comp of COMPONENT_MAP) {
      const cr = results.filter(r => r.component === comp.id);
      const passes = cr.filter(r => r.status === 'PASS').length;
      const times = cr.filter(r => r.status === 'PASS').map(r => r.timeMs).sort((a, b) => a - b);
      const medianTime = times.length > 0 ? times[Math.floor(times.length / 2)]! : 0;
      const avgCalls = cr.length > 0 ? (cr.reduce((s, r) => s + r.toolCalls, 0) / cr.length).toFixed(1) : '0';
      const avgTurns = cr.length > 0 ? (cr.reduce((s, r) => s + r.turnCount, 0) / cr.length).toFixed(1) : '0';
      const avgTokens = cr.length > 0 ? Math.round(cr.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0) / cr.length) : 0;
      const icon = passes === cr.length ? 'PASS' : passes > 0 ? 'FLAKY' : 'FAIL';
      lines.push(`| ${comp.num} | ${comp.id} | ${icon} ${passes}/${cr.length} | ${medianTime}ms | ${avgCalls} | ${avgTurns} | ${avgTokens} |`);
    }

    const totalPass = results.filter(r => r.status === 'PASS').length;
    lines.push('');
    lines.push(`**Total: ${totalPass}/${results.length} PASS (${(totalPass / results.length * 100).toFixed(1)}%)**`);
    fs.writeFileSync(mdPath, lines.join('\n'));
    console.log(`  Evidence: ${mdPath}`);
  }
}
