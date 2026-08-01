// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * API Spec Freshness Check Script
 *
 * Checks local F5 XC API specifications against one pinned upstream release.
 * Can optionally auto-sync if outdated.
 *
 * Usage:
 *   npx ts-node scripts/check-specs.ts              # Check and exit with code 0/1
 *   npx ts-node scripts/check-specs.ts --check      # Same as default
 *   npx ts-node scripts/check-specs.ts --sync       # Auto-sync if outdated
 *   npx ts-node scripts/check-specs.ts --json       # Output JSON status
 *   npx ts-node scripts/check-specs.ts --warn       # Warn only, don't fail
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  DISPATCH_EVENT_TYPE,
  localSpecsMatchDelivery,
  resolveSpecDelivery,
  SPEC_STATE_FILENAME,
} from './spec-delivery';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OPENAPI_PATH = path.join(PROJECT_ROOT, 'docs/specifications/api/openapi.json');
const UPSTREAM_REPO = 'f5-sales-demo/api-specs-enriched';

interface SpecStatus {
  currentVersion: string;
  expectedVersion: string;
  isUpToDate: boolean;
  upstreamUrl: string;
  error?: string;
}

/**
 * Get current spec version from local openapi.json
 */
function getCurrentVersion(): string {
  try {
    if (!fs.existsSync(OPENAPI_PATH)) {
      return 'none';
    }
    const content = fs.readFileSync(OPENAPI_PATH, 'utf-8');
    const spec = JSON.parse(content) as { info?: { version?: string } };
    return spec.info?.version || 'unknown';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error reading local specs: ${message}`);
    return 'error';
  }
}

/**
 * Check spec freshness against the resolved immutable delivery.
 */
function checkSpecFreshness(): SpecStatus {
  const currentVersion = getCurrentVersion();

  try {
    const delivery = resolveSpecDelivery();
    const stateFile = path.join(PROJECT_ROOT, 'docs', 'specifications', 'api', SPEC_STATE_FILENAME);

    return {
      currentVersion,
      expectedVersion: delivery.version,
      isUpToDate:
        currentVersion === delivery.version && localSpecsMatchDelivery(path.dirname(OPENAPI_PATH), stateFile, delivery),
      upstreamUrl: `https://github.com/${UPSTREAM_REPO}/releases/tag/${delivery.releaseTag}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      currentVersion,
      expectedVersion: 'unknown',
      isUpToDate: false,
      upstreamUrl: `https://github.com/${UPSTREAM_REPO}/releases`,
      error: message,
    };
  }
}

/**
 * Run sync-specs script to update specs
 */
async function runSync(): Promise<boolean> {
  const { spawn } = await import('node:child_process');

  return new Promise((resolve) => {
    console.log('🔄 Syncing specs from upstream...');

    // Args are fully static (a hardcoded script path, no untrusted input), and
    // `shell: true` is needed for reliable cross-platform `npx` resolution
    // (`npx.cmd` on Windows). Dev-only spec sync, not reachable from PR content.
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const child = spawn('npx', ['ts-node', path.join(__dirname, 'sync-specs.ts')], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldSync = args.includes('--sync');
  const jsonOutput = args.includes('--json');
  const warnOnly = args.includes('--warn');
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
F5 XC API Spec Freshness Check

Usage:
  npx ts-node scripts/check-specs.ts [options]

Options:
  --check   Check freshness and exit with code 0 (up-to-date) or 1 (outdated)
  --sync    Auto-sync specs if outdated
  --json    Output status as JSON
  --warn    Print warning but exit with code 0 even if outdated
  --help    Show this help message

Examples:
  npx ts-node scripts/check-specs.ts              # Check and fail if outdated
  npx ts-node scripts/check-specs.ts --sync       # Auto-sync if outdated
  npx ts-node scripts/check-specs.ts --json       # Get JSON status
`);
    return;
  }

  const status = checkSpecFreshness();

  if (jsonOutput) {
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.isUpToDate ? 0 : 1);
  }

  if (status.error) {
    console.warn(`⚠️  Warning: ${status.error}`);
    console.log(`   Current version: ${status.currentVersion}`);
    console.log(`   Unable to check upstream version`);

    // --warn is a developer-only escape hatch. It can never weaken an enriched
    // release delivery, even if a caller mistakenly supplies it in CI.
    const isSpecDispatch =
      process.env.GITHUB_EVENT_NAME === 'repository_dispatch' &&
      process.env.SPEC_DISPATCH_ACTION === DISPATCH_EVENT_TYPE;
    if (warnOnly && !isSpecDispatch) {
      console.warn('⚠️  Proceeding despite unverifiable freshness (--warn).');
      process.exit(0);
    }
    console.error('❌ Spec delivery cannot be verified. Refusing to use present or latest specs.');
    process.exit(1);
  }

  if (status.isUpToDate) {
    console.log(`✅ Specs are up-to-date (version ${status.currentVersion})`);
    process.exit(0);
  }

  // Specs are outdated
  console.log(`📦 Specs outdated: ${status.currentVersion} → ${status.expectedVersion}`);

  if (shouldSync) {
    const success = await runSync();
    if (success) {
      console.log(`✅ Specs synced to version ${status.expectedVersion}`);
      process.exit(0);
    } else {
      console.error('❌ Failed to sync specs');
      process.exit(1);
    }
  } else if (warnOnly) {
    console.warn(`⚠️  Warning: Specs differ from the pinned release. Run 'npm run specs:sync' to update.`);
    process.exit(0);
  } else {
    console.log(`   Run 'npm run specs:sync' to update`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
