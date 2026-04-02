import fs from 'fs';
import path from 'path';
import type { RunResult } from '../types.js';
import { successRate, averagePartialCompletion, averageJourneyTime } from '../metrics/compute.js';

export interface StakeholderReport {
  generatedAt: string;
  executiveSummary: string;
  providerRanking: ProviderRank[];
  journeyFindings: JourneyFinding[];
  recommendations: string[];
}

export interface ProviderRank {
  rank: number;
  provider: string;
  successRate: number;
  avgCompletionPct: number;
  avgJourneyTimeMs: number;
  score: number; // 0-100 composite
}

export interface JourneyFinding {
  journeyId: string;
  journeyName: string;
  category: string;
  bestProvider: string;
  bestSuccessRate: number;
  worstProvider: string;
  worstSuccessRate: number;
  notes: string;
}

function journeyCategory(journeyId: string): string {
  const categories: Record<string, string> = {
    J01: 'E-Commerce',
    J04: 'E-Commerce',
    J05: 'Travel',
    J08: 'Authentication',
    J09: 'Authentication',
    J12: 'Government Services',
    J14: 'E-Commerce',
    J17: 'Returns & Refunds',
  };
  return categories[journeyId] ?? 'General';
}

export function buildStakeholderReport(results: RunResult[]): StakeholderReport {
  if (results.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      executiveSummary: 'No results available.',
      providerRanking: [],
      journeyFindings: [],
      recommendations: [],
    };
  }

  // Build provider rankings
  const providerRanking: ProviderRank[] = results
    .map(run => {
      const sr = successRate(run.journeys);
      const cp = averagePartialCompletion(run.journeys);
      const at = averageJourneyTime(run.journeys);
      // Simple score: 60% success rate + 40% completion
      const score = Math.round((sr * 60 + cp * 40));
      return {
        provider: run.provider,
        successRate: sr,
        avgCompletionPct: cp,
        avgJourneyTimeMs: at,
        score,
        rank: 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  // Build journey findings
  const journeyMap = new Map<string, { name: string; rates: Record<string, number> }>();
  for (const run of results) {
    for (const j of run.journeys) {
      if (!journeyMap.has(j.journeyId)) {
        journeyMap.set(j.journeyId, { name: j.journeyName, rates: {} });
      }
      journeyMap.get(j.journeyId)!.rates[run.provider] = j.status === 'passed' ? 1 : 0;
    }
  }

  const journeyFindings: JourneyFinding[] = [];
  for (const [journeyId, { name, rates }] of journeyMap) {
    const providers = Object.entries(rates);
    if (providers.length === 0) continue;
    const best = providers.reduce((a, b) => (b[1] >= a[1] ? b : a));
    const worst = providers.reduce((a, b) => (b[1] <= a[1] ? b : a));
    const allPassed = providers.every(([, r]) => r === 1);
    const allFailed = providers.every(([, r]) => r === 0);
    let notes = '';
    if (allPassed) notes = 'All providers completed this journey successfully.';
    else if (allFailed) notes = 'No provider completed this journey — requires investigation.';
    else notes = `Performance varies significantly across providers.`;

    journeyFindings.push({
      journeyId,
      journeyName: name,
      category: journeyCategory(journeyId),
      bestProvider: best[0],
      bestSuccessRate: best[1],
      worstProvider: worst[0],
      worstSuccessRate: worst[1],
      notes,
    });
  }
  journeyFindings.sort((a, b) => a.journeyId.localeCompare(b.journeyId));

  // Executive summary
  const overall = results.flatMap(r => r.journeys);
  const overallSr = overall.length > 0
    ? overall.filter(j => j.status === 'passed').length / overall.length
    : 0;
  const topProvider = providerRanking[0];
  const executiveSummary = [
    `Benchmark completed across ${results.length} provider(s) and ${journeyMap.size} journey(s).`,
    `Overall success rate: ${(overallSr * 100).toFixed(1)}%.`,
    topProvider
      ? `Top-performing provider: ${topProvider.provider} (score: ${topProvider.score}/100, ${(topProvider.successRate * 100).toFixed(1)}% success).`
      : '',
    journeyFindings.filter(j => j.bestSuccessRate === 1 && j.worstSuccessRate === 1).length > 0
      ? `${journeyFindings.filter(j => j.bestSuccessRate === 1 && j.worstSuccessRate === 1).length} journey(s) succeeded across all providers.`
      : '',
    journeyFindings.filter(j => j.worstSuccessRate === 0).length > 0
      ? `${journeyFindings.filter(j => j.worstSuccessRate === 0).length} journey(s) had at least one provider failure.`
      : '',
  ].filter(Boolean).join(' ');

  // Recommendations
  const recommendations: string[] = [];
  if (providerRanking.length > 1) {
    const top = providerRanking[0];
    const bottom = providerRanking[providerRanking.length - 1];
    if (top && bottom && top.score - bottom.score > 20) {
      recommendations.push(`Consider ${top.provider} as the primary automation provider given its ${top.score - bottom.score} point lead over ${bottom.provider}.`);
    }
  }
  const failedJourneys = journeyFindings.filter(j => j.worstSuccessRate < 1);
  if (failedJourneys.length > 0) {
    recommendations.push(`Investigate failures in: ${failedJourneys.map(j => j.journeyId).join(', ')}.`);
  }
  const slowProviders = providerRanking.filter(p => p.avgJourneyTimeMs > 30000);
  if (slowProviders.length > 0) {
    recommendations.push(`Optimize performance for: ${slowProviders.map(p => p.provider).join(', ')} (avg > 30s per journey).`);
  }
  if (recommendations.length === 0) {
    recommendations.push('All providers performing well. Continue monitoring for regressions.');
  }

  return {
    generatedAt: new Date().toISOString(),
    executiveSummary,
    providerRanking,
    journeyFindings,
    recommendations,
  };
}

export function buildStakeholderMarkdown(report: StakeholderReport): string {
  let md = `# Stakeholder Summary Report\n\n`;
  md += `Generated: ${report.generatedAt}\n\n`;

  md += `## Executive Summary\n\n`;
  md += `${report.executiveSummary}\n\n`;

  md += `## Provider Ranking\n\n`;
  md += `| Rank | Provider | Success Rate | Avg Completion | Avg Time | Score |\n`;
  md += `|------|----------|-------------|----------------|----------|-------|\n`;
  for (const p of report.providerRanking) {
    md += `| ${p.rank} | ${p.provider} | ${(p.successRate * 100).toFixed(1)}% | ${(p.avgCompletionPct * 100).toFixed(1)}% | ${p.avgJourneyTimeMs.toFixed(0)}ms | ${p.score}/100 |\n`;
  }
  md += '\n';

  md += `## Journey Findings\n\n`;
  md += `| Journey | Category | Best Provider | Best Rate | Worst Provider | Worst Rate | Notes |\n`;
  md += `|---------|----------|--------------|-----------|----------------|------------|-------|\n`;
  for (const j of report.journeyFindings) {
    md += `| ${j.journeyId}: ${j.journeyName} | ${j.category} | ${j.bestProvider} | ${(j.bestSuccessRate * 100).toFixed(0)}% | ${j.worstProvider} | ${(j.worstSuccessRate * 100).toFixed(0)}% | ${j.notes} |\n`;
  }
  md += '\n';

  md += `## Recommendations\n\n`;
  for (const rec of report.recommendations) {
    md += `- ${rec}\n`;
  }
  md += '\n';

  return md;
}

export function generateStakeholderReport(
  results: RunResult[],
  outputDir: string
): { json: string; markdown: string } {
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const report = buildStakeholderReport(results);

  const jsonPath = path.join(outputDir, `stakeholder_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  const mdPath = path.join(outputDir, `stakeholder_${timestamp}.md`);
  fs.writeFileSync(mdPath, buildStakeholderMarkdown(report), 'utf-8');

  return { json: jsonPath, markdown: mdPath };
}
