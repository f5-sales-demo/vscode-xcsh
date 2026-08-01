// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Version generation script for F5 XC Tools
 *
 * Generates version strings based on upstream API version and timestamp.
 *
 * Formats:
 * - Git tag: v{upstream}-YYMMDDHHMMSS (e.g., v1.0.82-260101051607)
 * - Package.json (semver): {major}.{YYMM}.{DDHHMMSS} (e.g., 1.2601.1051607)
 * - Beta: v{upstream}-YYMMDDHHMMSS-BETA
 *
 * The 3-segment semver format is required by VS Code marketplace.
 * Each segment must be ≤ 2,147,483,647 (YYMM max=9912, DDHHMMSS max=31235959).
 *
 * Usage:
 *   npx ts-node scripts/version.ts           # Output current version
 *   npx ts-node scripts/version.ts --beta    # Output beta version
 *   npx ts-node scripts/version.ts --update  # Update package.json
 *   npx ts-node scripts/version.ts --json    # Output JSON format
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OPENAPI_PATH = path.join(PROJECT_ROOT, 'docs/specifications/api/openapi.json');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');

interface OpenApiInfo {
  info: {
    version: string;
  };
}

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

interface VersionInfo {
  upstream: string;
  timestamp: string;
  version: string;
  betaVersion: string;
  semver: string;
}

/**
 * Get upstream API version from OpenAPI spec
 */
function getUpstreamVersion(): string {
  try {
    const content = fs.readFileSync(OPENAPI_PATH, 'utf-8');
    const spec = JSON.parse(content) as OpenApiInfo;
    const version = spec.info?.version;

    if (!version) {
      throw new Error('info.version not found in OpenAPI spec');
    }

    return version;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error reading OpenAPI spec: ${message}`);
    process.exit(1);
  }
}

/**
 * Generate timestamp in YYMMDDHHMMSS format (UTC)
 */
export function generateTimestamp(sourceDateEpoch = process.env.SOURCE_DATE_EPOCH): string {
  let now: Date;
  if (sourceDateEpoch !== undefined) {
    if (!/^\d+$/.test(sourceDateEpoch)) {
      throw new Error('SOURCE_DATE_EPOCH must be non-negative integer seconds');
    }
    now = new Date(Number(sourceDateEpoch) * 1000);
    if (Number.isNaN(now.getTime())) {
      throw new Error('SOURCE_DATE_EPOCH is outside the supported date range');
    }
  } else {
    now = new Date();
  }
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const sec = String(now.getUTCSeconds()).padStart(2, '0');

  return `${yy}${mm}${dd}${hh}${min}${sec}`;
}

/**
 * Convert to semver-compatible format for package.json
 * VS Code requires standard 3-segment semver (major.minor.patch)
 * Each segment must be ≤ 2,147,483,647
 *
 * Format: {upstream_major}.{YYMM}.{DDHHMMSS}
 * Example: 1.2601.1051607 (upstream 1.x, Jan 2026, day 01 05:16:07)
 *
 * This provides:
 * - Major: Upstream API major version (1)
 * - Minor: Year-month (YYMM, max 9912, well under limit)
 * - Patch: Day-hour-minute-second (DDHHMMSS, max 31235959, well under limit)
 */
function toSemver(upstream: string, timestamp: string): string {
  // upstream is like "1.0.82"
  // timestamp is like "260101051607" (YYMMDDHHMMSS)
  const parts = upstream.split('.');
  const major = parts[0] || '0';

  // Extract YYMM for minor version
  // timestamp: 260101051607 → YYMM: 2601
  const yymm = parseInt(timestamp.slice(0, 4), 10);

  // Extract DDHHMMSS for patch version
  // timestamp: 260101051607 → DDHHMMSS: 01051607 → integer: 1051607
  const ddhhmmss = parseInt(timestamp.slice(4), 10);

  // Use 3-segment format: major.YYMM.DDHHMMSS
  return `${major}.${yymm}.${ddhhmmss}`;
}

/**
 * Parse a release tag (`v{upstream}-YYMMDDHHMMSS[-BETA]`) into its parts, so a release
 * can stamp the exact version its tag represents rather than generating a fresh
 * timestamp (which caused published-version drift/collisions). Returns null when the
 * tag does not match the expected format.
 */
export function parseTag(tag: string): { upstream: string; timestamp: string; isBeta: boolean } | null {
  const match = tag.match(/^v(.+)-(\d{12})(-BETA)?$/);
  if (!match) {
    return null;
  }
  return { upstream: match[1] as string, timestamp: match[2] as string, isBeta: Boolean(match[3]) };
}

/**
 * Generate all version information. When `override` is supplied (e.g. derived from a
 * release tag) its upstream/timestamp are used verbatim instead of the live
 * OpenAPI version + current time — keeping the published version identical to the tag.
 */
export function generateVersionInfo(
  isBeta: boolean = false,
  override?: { upstream: string; timestamp: string },
): VersionInfo {
  const upstream = override?.upstream ?? getUpstreamVersion();
  const timestamp = override?.timestamp ?? generateTimestamp();
  const version = `${upstream}-${timestamp}`;
  const betaVersion = `${version}-BETA`;

  return {
    upstream,
    timestamp,
    version: isBeta ? betaVersion : version,
    betaVersion,
    semver: toSemver(upstream, timestamp),
  };
}

/**
 * Update package.json with the given semver (already computed — no regeneration).
 */
function updatePackageJson(semver: string): void {
  try {
    const content = fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8');
    const pkg = JSON.parse(content) as PackageJson;

    pkg.version = semver;

    fs.writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
    console.log(`Updated package.json version to: ${pkg.version}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error updating package.json: ${message}`);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const isBeta = args.includes('--beta');
  const shouldUpdate = args.includes('--update');
  const jsonOutput = args.includes('--json');
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
F5 XC Tools Version Generator

Usage:
  npx ts-node scripts/version.ts [options]

Options:
  --beta    Generate beta version (adds -BETA suffix)
  --update  Update package.json with generated version
  --json    Output in JSON format
  --help    Show this help message

Examples:
  npx ts-node scripts/version.ts           # Output: 1.0.82-260101051607
  npx ts-node scripts/version.ts --beta    # Output: 1.0.82-260101051607-BETA
  npx ts-node scripts/version.ts --update  # Updates package.json to 1.2601.10516
  npx ts-node scripts/version.ts --json    # Shows version, semver, upstream, etc.
`);
    return;
  }

  // Optional: derive the version from an explicit release tag (CLI --from-tag=<tag>
  // or RELEASE_TAG env) so a release publishes exactly the version its tag encodes.
  const fromTagArg = args.find((a) => a.startsWith('--from-tag='))?.split('=')[1] ?? process.env.RELEASE_TAG;
  let override: { upstream: string; timestamp: string } | undefined;
  let betaFromTag = false;
  if (fromTagArg) {
    const parsed = parseTag(fromTagArg);
    if (!parsed) {
      console.error(`Invalid release tag: "${fromTagArg}" (expected v{upstream}-YYMMDDHHMMSS[-BETA])`);
      process.exit(1);
    }
    override = { upstream: parsed.upstream, timestamp: parsed.timestamp };
    betaFromTag = parsed.isBeta;
  }

  const info = generateVersionInfo(isBeta || betaFromTag, override);

  if (shouldUpdate) {
    updatePackageJson(info.semver);
    return;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(info.version);
  }
}

if (require.main === module) {
  main();
}
