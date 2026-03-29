import fs from 'fs';
import path from 'path';
import type { RunResult } from '../types.js';
import { successRate, averagePartialCompletion, totalExecutionTime, averageJourneyTime } from '../metrics/compute.js';

/** Generate a JSON report file */
export function generateJsonReport(result: RunResult, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = result.startedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `report_${timestamp}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');
  return filepath;
}

/** Generate a Markdown report file */
export function generateMarkdownReport(result: RunResult, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = result.startedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `report_${timestamp}.md`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, buildMarkdown(result), 'utf-8');
  return filepath;
}

function buildMarkdown(result: RunResult): string {
  const sr = (successRate(result.journeys) * 100).toFixed(1);
  const apc = (averagePartialCompletion(result.journeys) * 100).toFixed(1);
  const total = totalExecutionTime(result);
  const avg = averageJourneyTime(result.journeys).toFixed(0);
  const passIcon = (s: string) => s === 'passed' ? 'PASS' : s === 'failed' ? 'FAIL' : 'ERROR';

  let md = `# Benchmark Run Report

## Summary

| Field | Value |
|-------|-------|
| Date | ${result.startedAt} |
| Provider | ${result.provider} |
| Site | ${result.site} |
| Target URL | ${result.targetUrl} |
| Journeys | ${result.totalJourneys} |
| Passed | ${result.passed} |
| Failed | ${result.failed} |
| Success Rate (M1) | ${sr}% |
| Avg Partial Completion (M2) | ${apc}% |
| Total Time | ${total}ms |
| Avg Journey Time (M3) | ${avg}ms |

## Journey Results

`;

  for (const journey of result.journeys) {
    md += `### ${journey.journeyId}: ${journey.journeyName} [${passIcon(journey.status)}]\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| Status | ${journey.status} |\n`;
    md += `| Time | ${journey.executionTimeMs}ms |\n`;
    md += `| Steps | ${journey.stepsCompleted}/${journey.stepsTotal} |\n`;
    md += `| Partial Completion | ${(journey.partialCompletion * 100).toFixed(1)}% |\n`;
    if (journey.errorMessage) {
      md += `| Error | \`${journey.errorMessage.replace(/`/g, "'")}\` |\n`;
    }
    md += '\n';

    // Show step details for failed journeys
    if (journey.status !== 'passed' && journey.steps.length > 0) {
      md += `#### Steps\n\n`;
      md += `| # | Step | Status | Time |\n|---|------|--------|------|\n`;
      for (const step of journey.steps) {
        const icon = step.status === 'passed' ? 'pass' : step.status === 'failed' ? 'FAIL' : 'skip';
        md += `| ${step.stepIndex + 1} | ${step.stepName} | ${icon} ${step.status} | ${step.executionTimeMs}ms |\n`;
        if (step.errorMessage) {
          md += `| | | _${step.errorMessage.replace(/\|/g, '\\|').slice(0, 100)}_ | |\n`;
        }
      }
      md += '\n';
    }
  }

  return md;
}
