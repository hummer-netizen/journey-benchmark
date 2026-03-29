import fs from 'fs';
import path from 'path';
import type { BrowserContext, Page } from 'playwright';

/** Configuration for Playwright trace and media capture */
export interface TraceConfig {
  enabled: boolean;
  /** Root directory for trace output; journey sub-dirs are created automatically */
  outputDir: string;
  /** Embed screenshots in the trace */
  screenshots: boolean;
  /** Embed DOM snapshots in the trace */
  snapshots: boolean;
  /** Embed source files in the trace */
  sources: boolean;
  /** Capture a HAR file alongside the trace */
  har: boolean;
  /** Record a video of the page */
  video: boolean;
}

/** Build a default TraceConfig for a given run ID */
export function defaultTraceConfig(runId: string, baseDir = 'traces'): TraceConfig {
  return {
    enabled: true,
    outputDir: path.join(baseDir, runId),
    screenshots: true,
    snapshots: true,
    sources: false,
    har: false,
    video: false,
  };
}

/**
 * Start recording a Playwright trace on a browser context.
 * No-op when config.enabled is false.
 */
export async function startTrace(context: BrowserContext, config: TraceConfig): Promise<void> {
  if (!config.enabled) return;
  fs.mkdirSync(config.outputDir, { recursive: true });
  await context.tracing.start({
    screenshots: config.screenshots,
    snapshots: config.snapshots,
    sources: config.sources,
  });
}

/**
 * Stop the trace and write it to {outputDir}/{journeyId}.zip.
 * Returns the file path on success, or null if tracing is disabled.
 */
export async function stopTrace(
  context: BrowserContext,
  journeyId: string,
  config: TraceConfig
): Promise<string | null> {
  if (!config.enabled) return null;
  const tracePath = path.join(config.outputDir, `${journeyId}.zip`);
  await context.tracing.stop({ path: tracePath });
  return tracePath;
}

/**
 * Capture a full-page screenshot during a journey step.
 * Saves to {outputDir}/{journeyId}/screenshots/{stepName}.png.
 * Returns file path, or null if disabled.
 */
export async function captureScreenshot(
  page: Page,
  journeyId: string,
  stepName: string,
  config: TraceConfig
): Promise<string | null> {
  if (!config.enabled || !config.screenshots) return null;
  const dir = path.join(config.outputDir, journeyId, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const safeName = stepName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const screenshotPath = path.join(dir, `${safeName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return screenshotPath;
}
