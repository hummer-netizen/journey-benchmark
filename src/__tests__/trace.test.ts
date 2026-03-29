import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { defaultTraceConfig } from '../runner/trace.js';
import type { TraceConfig } from '../runner/trace.js';

describe('defaultTraceConfig', () => {
  it('sets enabled to true', () => {
    const config = defaultTraceConfig('run-1');
    expect(config.enabled).toBe(true);
  });

  it('builds outputDir from runId', () => {
    const config = defaultTraceConfig('my-run-123');
    expect(config.outputDir).toContain('my-run-123');
  });

  it('uses custom baseDir when provided', () => {
    const config = defaultTraceConfig('r1', '/custom/traces');
    expect(config.outputDir).toBe('/custom/traces/r1');
  });

  it('enables screenshots and snapshots by default', () => {
    const config = defaultTraceConfig('r1');
    expect(config.screenshots).toBe(true);
    expect(config.snapshots).toBe(true);
  });

  it('disables sources, har, and video by default', () => {
    const config = defaultTraceConfig('r1');
    expect(config.sources).toBe(false);
    expect(config.har).toBe(false);
    expect(config.video).toBe(false);
  });
});

describe('TraceConfig shape', () => {
  it('has all required fields', () => {
    const config: TraceConfig = {
      enabled: true,
      outputDir: '/tmp/traces/run1',
      screenshots: true,
      snapshots: true,
      sources: false,
      har: false,
      video: false,
    };

    expect(config.enabled).toBe(true);
    expect(config.outputDir).toBe('/tmp/traces/run1');
    expect(typeof config.screenshots).toBe('boolean');
    expect(typeof config.snapshots).toBe('boolean');
    expect(typeof config.sources).toBe('boolean');
    expect(typeof config.har).toBe('boolean');
    expect(typeof config.video).toBe('boolean');
  });

  it('can be configured for HAR and video', () => {
    const config: TraceConfig = {
      enabled: true,
      outputDir: '/tmp/t',
      screenshots: true,
      snapshots: false,
      sources: false,
      har: true,
      video: true,
    };
    expect(config.har).toBe(true);
    expect(config.video).toBe(true);
  });
});

describe('trace output directory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  });

  it('defaultTraceConfig produces a path within baseDir', () => {
    const config = defaultTraceConfig('run-xyz', tmpDir);
    expect(config.outputDir.startsWith(tmpDir)).toBe(true);
  });

  it('outputDir can be created via fs.mkdirSync', () => {
    const config = defaultTraceConfig('run-abc', tmpDir);
    fs.mkdirSync(config.outputDir, { recursive: true });
    expect(fs.existsSync(config.outputDir)).toBe(true);
  });
});
