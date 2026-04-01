import fs from 'fs';
import { generateRepros } from '../src/repro/generator.js';
import type { Journey, JourneyResult } from '../src/types.js';
import type { Page } from 'playwright';
import type { MetricCollector } from '../src/metrics/collector.js';
import type { AutomationProvider } from '../src/webfuse/provider.js';

// Load the most recent WebfuseProvider full-run failure report
const reportPath = './reports/report_2026-04-01_12-41-12.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

// Build minimal journey definitions from the report data
const journeyDefs: Journey[] = report.journeys.map((j: JourneyResult) => ({
  id: j.journeyId,
  name: j.journeyName,
  steps: j.steps.map((s, i: number) => ({
    name: s.stepName,
    goal: s.stepName,
    execute: async (_page: Page) => {},
  })),
  execute: async (_page: Page, _collector: MetricCollector, _provider?: AutomationProvider) => j,
}));

const repros = generateRepros(journeyDefs, report.journeys, {
  outputDir: './repros',
  targetUrl: report.targetUrl ?? 'https://webarena-shop.webfuse.it/',
});

console.log(`Generated ${repros.length} repro files:`);
for (const r of repros) {
  console.log(`  ${r.journeyId}: ${r.filePath} (${r.failedStep}: ${r.errorMessage})`);
}
