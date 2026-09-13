import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runDiscovery } = require('../scripts/discovery-agent.cjs');

describe('Discovery Agent Engine', () => {
  const rootDir = path.resolve(__dirname, '..');
  const reportPath = path.join(rootDir, 'discovery-report.json');

  afterEach(() => {
    // Clean up generated report file after tests
    if (fs.existsSync(reportPath)) {
      try {
        fs.unlinkSync(reportPath);
      } catch (e) {
        // Ignore cleanup error
      }
    }
  });

  it('scans the repository dynamically and returns structured findings', () => {
    const report = runDiscovery({ rootDir, writeReport: false, silent: true });

    expect(report).toBeDefined();
    expect(report.generatedAt).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(report.summary.totalFindings).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report.findings)).toBe(true);
  });

  it('ensures every finding adheres to the required finding schema', () => {
    const report = runDiscovery({ rootDir, writeReport: false, silent: true });
    const validSeverities = ['Critical', 'High', 'Medium', 'Low'];
    const validStatuses = ['Confirmed Issue', 'Suggestion'];

    report.findings.forEach((finding) => {
      expect(finding.id).toMatch(/^DISC-[A-Z]{4}-\d{3}$/);
      expect(finding.category).toBeTypeOf('string');
      expect(finding.title).toBeTypeOf('string');
      expect(validSeverities).toContain(finding.severity);
      expect(validStatuses).toContain(finding.status);
      expect(finding.reasoning).toBeTypeOf('string');
      expect(finding.recommendedAction).toBeTypeOf('string');

      if (finding.status === 'Confirmed Issue') {
        expect(finding.evidence).toBeDefined();
      }
    });
  });

  it('generates a valid machine-readable discovery-report.json when writeReport is true', () => {
    const report = runDiscovery({ rootDir, writeReport: true, silent: true });

    expect(fs.existsSync(reportPath)).toBe(true);
    const fileContent = fs.readFileSync(reportPath, 'utf-8');
    const parsed = JSON.parse(fileContent);

    expect(parsed.generatedAt).toBe(report.generatedAt);
    expect(parsed.summary.totalFindings).toBe(report.summary.totalFindings);
    expect(parsed.findings.length).toBe(report.findings.length);
  });
});
