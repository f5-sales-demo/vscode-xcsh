// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { execFileSync } from 'node:child_process';

interface AuditVulnerability {
  severity?: string;
  via?: Array<
    | string
    | {
        source?: number;
        url?: string;
      }
  >;
}

interface AuditReport {
  metadata?: {
    vulnerabilities?: Record<string, number>;
  };
  vulnerabilities?: Record<string, AuditVulnerability>;
}

const ALLOWED_HIGH = new Map([
  [
    'brace-expansion',
    {
      advisory: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
      trackingIssue: 'https://github.com/f5-sales-demo/vscode-xcsh/issues/1102',
    },
  ],
]);

function auditJson(): string {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    return execFileSync(executable, ['audit', '--json'], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'stdout' in error && typeof error.stdout === 'string') {
      return error.stdout;
    }
    throw error;
  }
}

function main(): void {
  const report = JSON.parse(auditJson()) as AuditReport;
  if (!report.vulnerabilities || !report.metadata?.vulnerabilities) {
    throw new Error('npm audit returned an incomplete report');
  }

  const blocking: string[] = [];
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (vulnerability.severity === 'critical') {
      blocking.push(`${packageName} (critical)`);
      continue;
    }
    if (vulnerability.severity !== 'high') {
      continue;
    }
    const allowed = ALLOWED_HIGH.get(packageName);
    const advisoryUrls = (vulnerability.via ?? [])
      .filter((item): item is { source?: number; url?: string } => typeof item !== 'string')
      .map((item) => item.url);
    if (!allowed || !advisoryUrls.includes(allowed.advisory)) {
      blocking.push(`${packageName} (high)`);
    }
  }

  if (blocking.length > 0) {
    throw new Error(`Unaccepted high/critical audit findings: ${blocking.join(', ')}`);
  }

  for (const [packageName, allowed] of ALLOWED_HIGH) {
    if (report.vulnerabilities[packageName]?.severity === 'high') {
      console.warn(`Known high advisory: ${packageName}; tracked by ${allowed.trackingIssue}`);
    }
  }
  console.log(`npm audit counts: ${JSON.stringify(report.metadata.vulnerabilities)}`);
}

main();
