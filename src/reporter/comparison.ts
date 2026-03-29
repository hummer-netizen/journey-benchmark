import fs from 'fs';
import path from 'path';
import type { RunResult } from '../types.js';
import { successRate, averagePartialCompletion, averageJourneyTime } from '../metrics/compute.js';

/** Per-provider result for a single journey row */
export interface JourneyCell {
  status: string;
  successRate: number;
  partialCompletion: number;
  executionTimeMs: number;
  tokenCost?: number;
}

/** One row of the comparison table (one journey across all providers) */
export interface ComparisonRow {
  journeyId: string;
  journeyName: string;
  cells: Record<string, JourneyCell>;
}

/** Per-provider aggregate summary */
export interface ProviderSummary {
  successRate: number;
  avgPartialCompletion: number;
  avgJourneyTimeMs: number;
  totalTokenCost?: number;
}

/** Full comparison report data */
export interface ComparisonReport {
  generatedAt: string;
  providers: string[];
  rows: ComparisonRow[];
  summary: Record<string, ProviderSummary>;
}

/** Build comparison report data from multiple RunResult objects */
export function buildComparisonReport(
  results: RunResult[],
  tokenCostByProvider: Record<string, number> = {}
): ComparisonReport {
  const providers = results.map(r => r.provider);
  const journeyMap = new Map<string, ComparisonRow>();

  for (const run of results) {
    for (const journey of run.journeys) {
      if (!journeyMap.has(journey.journeyId)) {
        journeyMap.set(journey.journeyId, {
          journeyId: journey.journeyId,
          journeyName: journey.journeyName,
          cells: {},
        });
      }
      journeyMap.get(journey.journeyId)!.cells[run.provider] = {
        status: journey.status,
        successRate: journey.status === 'passed' ? 1 : 0,
        partialCompletion: journey.partialCompletion,
        executionTimeMs: journey.executionTimeMs,
      };
    }
  }

  const summary: Record<string, ProviderSummary> = {};
  for (const run of results) {
    const entry: ProviderSummary = {
      successRate: successRate(run.journeys),
      avgPartialCompletion: averagePartialCompletion(run.journeys),
      avgJourneyTimeMs: averageJourneyTime(run.journeys),
    };
    if (tokenCostByProvider[run.provider] !== undefined) {
      entry.totalTokenCost = tokenCostByProvider[run.provider];
    }
    summary[run.provider] = entry;
  }

  return {
    generatedAt: new Date().toISOString(),
    providers,
    rows: Array.from(journeyMap.values()),
    summary,
  };
}

/** Generate Markdown from a ComparisonReport */
export function buildComparisonMarkdown(report: ComparisonReport): string {
  const { providers, rows, summary } = report;

  let md = `# Provider Comparison Report\n\n`;
  md += `Generated: ${report.generatedAt}\n\n`;

  // Summary table
  md += `## Summary\n\n`;
  const summaryHeaders = ['Metric', ...providers];
  md += `| ${summaryHeaders.join(' | ')} |\n`;
  md += `|${summaryHeaders.map(() => '---').join('|')}|\n`;
  md += `| Success Rate | ${providers.map(p => `${((summary[p]?.successRate ?? 0) * 100).toFixed(1)}%`).join(' | ')} |\n`;
  md += `| Avg Partial Completion | ${providers.map(p => `${((summary[p]?.avgPartialCompletion ?? 0) * 100).toFixed(1)}%`).join(' | ')} |\n`;
  md += `| Avg Journey Time | ${providers.map(p => `${(summary[p]?.avgJourneyTimeMs ?? 0).toFixed(0)}ms`).join(' | ')} |\n`;
  const hasCosts = providers.some(p => summary[p]?.totalTokenCost !== undefined);
  if (hasCosts) {
    md += `| Token Cost | ${providers.map(p => summary[p]?.totalTokenCost !== undefined ? `$${(summary[p].totalTokenCost!).toFixed(4)}` : '—').join(' | ')} |\n`;
  }
  md += '\n';

  // Per-journey table
  md += `## Journey Results\n\n`;
  const journeyHeaders = ['Journey', ...providers];
  md += `| ${journeyHeaders.join(' | ')} |\n`;
  md += `|${journeyHeaders.map(() => '---').join('|')}|\n`;

  for (const row of rows) {
    const label = `${row.journeyId}: ${row.journeyName}`;
    const cells = [label];
    for (const provider of providers) {
      const cell = row.cells[provider];
      if (cell) {
        const icon = cell.status === 'passed' ? 'PASS' : cell.status === 'failed' ? 'FAIL' : 'ERR';
        cells.push(`${icon} ${(cell.partialCompletion * 100).toFixed(0)}% ${cell.executionTimeMs}ms`);
      } else {
        cells.push('—');
      }
    }
    md += `| ${cells.join(' | ')} |\n`;
  }

  return md;
}

/** Write comparison report to JSON + Markdown files and return their paths */
export function generateComparisonReport(
  results: RunResult[],
  outputDir: string,
  tokenCostByProvider: Record<string, number> = {}
): { json: string; markdown: string } {
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const report = buildComparisonReport(results, tokenCostByProvider);

  const jsonPath = path.join(outputDir, `comparison_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  const mdPath = path.join(outputDir, `comparison_${timestamp}.md`);
  fs.writeFileSync(mdPath, buildComparisonMarkdown(report), 'utf-8');

  return { json: jsonPath, markdown: mdPath };
}
