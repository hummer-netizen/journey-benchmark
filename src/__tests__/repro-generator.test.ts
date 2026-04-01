import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateReproFile, generateRepros } from '../repro/generator.js';
import type { Journey, JourneyResult, JourneyStep } from '../types.js';
import type { MetricCollector } from '../metrics/collector.js';
import type { AutomationProvider } from '../webfuse/provider.js';
import type { Page } from 'playwright';

// --- Test helpers ---

function makeStep(name: string, goal?: string): JourneyStep {
  return {
    name,
    goal,
    execute: async (_page: Page) => {},
  };
}

function makeJourney(id: string, name: string, steps: JourneyStep[]): Journey {
  return {
    id,
    name,
    steps,
    execute: async (_page: Page, _collector: MetricCollector, _provider?: AutomationProvider) => {
      return {
        journeyId: id,
        journeyName: name,
        status: 'passed' as const,
        executionTimeMs: 0,
        partialCompletion: 1,
        stepsTotal: steps.length,
        stepsCompleted: steps.length,
        steps: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    },
  };
}

function makeFailedResult(journeyId: string, journeyName: string, failedStepIndex: number, totalSteps: number, errorMessage: string): JourneyResult {
  const steps = [];
  for (let i = 0; i < totalSteps; i++) {
    if (i < failedStepIndex) {
      steps.push({ stepIndex: i, stepName: `Step ${i + 1}`, status: 'passed' as const, executionTimeMs: 100 });
    } else if (i === failedStepIndex) {
      steps.push({ stepIndex: i, stepName: `Step ${i + 1}`, status: 'failed' as const, executionTimeMs: 50, errorMessage });
    } else {
      steps.push({ stepIndex: i, stepName: `Step ${i + 1}`, status: 'skipped' as const, executionTimeMs: 0 });
    }
  }
  return {
    journeyId,
    journeyName,
    status: 'failed',
    executionTimeMs: 500,
    partialCompletion: failedStepIndex / totalSteps,
    stepsTotal: totalSteps,
    stepsCompleted: failedStepIndex,
    steps,
    errorMessage,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

function makePassedResult(journeyId: string, journeyName: string, totalSteps: number): JourneyResult {
  return {
    journeyId,
    journeyName,
    status: 'passed',
    executionTimeMs: 500,
    partialCompletion: 1,
    stepsTotal: totalSteps,
    stepsCompleted: totalSteps,
    steps: Array.from({ length: totalSteps }, (_, i) => ({
      stepIndex: i,
      stepName: `Step ${i + 1}`,
      status: 'passed' as const,
      executionTimeMs: 100,
    })),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

// --- Tests ---

describe('Repro Generator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generateReproFile', () => {
    it('generates HTML file for a failed journey', () => {
      const steps = [
        makeStep('Navigate to homepage', 'Navigate to the shop homepage'),
        makeStep('Search for product', "Type 'book' into the search bar"),
        makeStep('Add to cart', 'Click the Add to Cart button'),
      ];
      const journey = makeJourney('J01', 'Simple Product Purchase', steps);
      const result = makeFailedResult('J01', 'Simple Product Purchase', 1, 3, 'No product found in search results');

      const repro = generateReproFile(journey, result, { outputDir: tmpDir, targetUrl: 'http://localhost:7770' });

      expect(repro).not.toBeNull();
      expect(repro!.journeyId).toBe('J01');
      expect(repro!.failedStep).toBe('Step 2');
      expect(repro!.errorMessage).toBe('No product found in search results');
      expect(fs.existsSync(repro!.filePath)).toBe(true);

      const html = fs.readFileSync(repro!.filePath, 'utf-8');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('J01');
      expect(html).toContain('Simple Product Purchase');
      expect(html).toContain('No product found in search results');
      expect(html).toContain('Navigate to homepage');
      expect(html).toContain('Search for product');
      expect(html).toContain('http://localhost:7770');
    });

    it('returns null for a passed journey', () => {
      const steps = [makeStep('Step 1')];
      const journey = makeJourney('J01', 'Test', steps);
      const result = makePassedResult('J01', 'Test', 1);

      const repro = generateReproFile(journey, result, { outputDir: tmpDir });
      expect(repro).toBeNull();
    });

    it('filename follows repro-[component]-[timestamp].html pattern', () => {
      const steps = [makeStep('Step 1')];
      const journey = makeJourney('J05', 'Flight Booking', steps);
      const result = makeFailedResult('J05', 'Flight Booking', 0, 1, 'Timeout');

      const repro = generateReproFile(journey, result, { outputDir: tmpDir });
      expect(repro).not.toBeNull();
      expect(path.basename(repro!.filePath)).toMatch(/^repro-j05-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.html$/);
    });

    it('includes expected vs actual behaviour comment block', () => {
      const steps = [makeStep('Navigate', 'Go to homepage'), makeStep('Click', 'Click button')];
      const journey = makeJourney('J08', 'Account Registration', steps);
      const result = makeFailedResult('J08', 'Account Registration', 1, 2, 'Timeout waiting for selector');

      const repro = generateReproFile(journey, result, { outputDir: tmpDir, targetUrl: 'https://auth-app.webfuse.it' });
      const html = fs.readFileSync(repro!.filePath, 'utf-8');

      expect(html).toContain('EXPECTED BEHAVIOUR');
      expect(html).toContain('ACTUAL BEHAVIOUR');
      expect(html).toContain('WebfuseProvider');
      expect(html).toContain('HOW TO REPRODUCE');
      expect(html).toContain('Surfly');
    });

    it('includes interactive iframe and JS runner', () => {
      const steps = [makeStep('Navigate')];
      const journey = makeJourney('J12', 'Gov Form', steps);
      const result = makeFailedResult('J12', 'Gov Form', 0, 1, 'Timeout');

      const repro = generateReproFile(journey, result, { outputDir: tmpDir });
      const html = fs.readFileSync(repro!.filePath, 'utf-8');

      expect(html).toContain('<iframe');
      expect(html).toContain('loadTarget()');
      expect(html).toContain('runRepro()');
      expect(html).toContain('STEPS');
    });

    it('creates output directory if it does not exist', () => {
      const nested = path.join(tmpDir, 'deep', 'nested', 'dir');
      const steps = [makeStep('Step 1')];
      const journey = makeJourney('J01', 'Test', steps);
      const result = makeFailedResult('J01', 'Test', 0, 1, 'Error');

      const repro = generateReproFile(journey, result, { outputDir: nested });
      expect(repro).not.toBeNull();
      expect(fs.existsSync(repro!.filePath)).toBe(true);
    });
  });

  describe('generateRepros', () => {
    it('generates repros only for failed journeys', () => {
      const j1Steps = [makeStep('Step 1'), makeStep('Step 2')];
      const j2Steps = [makeStep('Step A')];
      const j3Steps = [makeStep('Step X'), makeStep('Step Y'), makeStep('Step Z')];

      const journeys = [
        makeJourney('J01', 'Purchase', j1Steps),
        makeJourney('J04', 'Cart Recovery', j2Steps),
        makeJourney('J05', 'Flight Booking', j3Steps),
      ];

      const results: JourneyResult[] = [
        makeFailedResult('J01', 'Purchase', 1, 2, 'No product found'),
        makePassedResult('J04', 'Cart Recovery', 1),
        makeFailedResult('J05', 'Flight Booking', 2, 3, 'Timeout waiting for selector'),
      ];

      const repros = generateRepros(journeys, results, { outputDir: tmpDir });
      expect(repros).toHaveLength(2);
      expect(repros.map(r => r.journeyId)).toEqual(['J01', 'J05']);
    });

    it('returns empty array when all journeys pass', () => {
      const journeys = [makeJourney('J01', 'Test', [makeStep('S1')])];
      const results = [makePassedResult('J01', 'Test', 1)];

      const repros = generateRepros(journeys, results, { outputDir: tmpDir });
      expect(repros).toHaveLength(0);
    });

    it('skips journeys not found in the journey list', () => {
      const journeys = [makeJourney('J01', 'Test', [makeStep('S1')])];
      const results: JourneyResult[] = [
        makeFailedResult('J99', 'Unknown', 0, 1, 'Error'),
      ];

      const repros = generateRepros(journeys, results, { outputDir: tmpDir });
      expect(repros).toHaveLength(0);
    });
  });

  describe('HTML content quality', () => {
    it('escapes HTML special characters in error messages', () => {
      const steps = [makeStep('Step 1')];
      const journey = makeJourney('J01', 'Test', steps);
      const result = makeFailedResult('J01', 'Test', 0, 1, 'Expected <div class="foo"> but got <span>');

      const repro = generateReproFile(journey, result, { outputDir: tmpDir });
      const html = fs.readFileSync(repro!.filePath, 'utf-8');

      // Should be escaped, not raw HTML
      expect(html).toContain('&lt;div');
      expect(html).not.toContain('Expected <div class="foo">');
    });

    it('has no external dependencies (standalone)', () => {
      const steps = [makeStep('Navigate'), makeStep('Click')];
      const journey = makeJourney('J01', 'Test', steps);
      const result = makeFailedResult('J01', 'Test', 1, 2, 'Error');

      const repro = generateReproFile(journey, result, { outputDir: tmpDir });
      const html = fs.readFileSync(repro!.filePath, 'utf-8');

      // No external script/link tags (only inline styles and scripts)
      expect(html).not.toMatch(/<script\s+src=/);
      expect(html).not.toMatch(/<link\s+.*href=.*\.css/);
    });

    it('includes step goals in the action sequence', () => {
      const steps = [
        makeStep('Navigate to homepage', 'Navigate to the shop homepage and wait for the search bar'),
        makeStep('Search for product', "Type 'book' into the search bar and press Enter"),
      ];
      const journey = makeJourney('J01', 'Purchase', steps);
      const result = makeFailedResult('J01', 'Purchase', 1, 2, 'No results');

      const repro = generateReproFile(journey, result, { outputDir: tmpDir });
      const html = fs.readFileSync(repro!.filePath, 'utf-8');

      expect(html).toContain('Navigate to the shop homepage');
      expect(html).toContain("Type &#39;book&#39; into the search bar");
    });
  });
});
