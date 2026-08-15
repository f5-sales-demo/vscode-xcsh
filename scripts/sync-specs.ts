// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * API Spec Sync Script
 *
 * Downloads and extracts one pinned F5 XC API specification release.
 *
 * Usage:
 *   npx ts-node scripts/sync-specs.ts
 *   npx ts-node scripts/sync-specs.ts --force    # Force sync even if up-to-date
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import { loadResourceCoverage } from './generators/spec-parser';
import {
  computeSpecTreeSha256,
  type LocalSpecState,
  resolveSpecDelivery,
  SPEC_STATE_FILENAME,
  type SpecVersion,
  validateBundleSha256,
  validateRelease,
  validateTargetCommit,
} from './spec-delivery';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SPECS_DIR = path.join(PROJECT_ROOT, 'docs/specifications/api');
const UPSTREAM_REPO = 'f5-sales-demo/api-specs-enriched';

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    digest?: string | null;
    name: string;
    browser_download_url: string;
  }>;
}

interface GitObject {
  object: {
    sha: string;
    type: 'commit' | 'tag';
  };
}

/**
 * Exact GitHub API path for a pinned release. There is deliberately no
 * mutable-release fallback: retrying one delivery must resolve the same bytes.
 */
export function releaseApiPath(releaseTag: string): string {
  return `/repos/${UPSTREAM_REPO}/releases/tags/${encodeURIComponent(releaseTag)}`;
}

export function expectedBundleName(release: SpecVersion): string {
  validateRelease(release);
  return `f5xc-api-specs-${release.releaseTag}.zip`;
}

async function fetchGitHubJson<T>(apiPath: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'vscode-xcsh',
      Accept: 'application/vnd.github.v3+json',
    };

    // Use GH_TOKEN or GITHUB_TOKEN if available (for CI rate limits)
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error('Failed to parse GitHub API response'));
          }
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/** Fetch one exact tagged release from GitHub. */
async function fetchReleaseByTag(releaseTag: string): Promise<GitHubRelease> {
  return fetchGitHubJson<GitHubRelease>(releaseApiPath(releaseTag));
}

/** Resolve an annotated or lightweight tag to the exact commit it names. */
async function fetchTagCommit(releaseTag: string): Promise<string> {
  let object = (
    await fetchGitHubJson<GitObject>(`/repos/${UPSTREAM_REPO}/git/ref/tags/${encodeURIComponent(releaseTag)}`)
  ).object;
  const seen = new Set<string>();
  for (let depth = 0; depth < 10; depth += 1) {
    validateTargetCommit(object.sha);
    if (object.type === 'commit') {
      return object.sha;
    }
    if (object.type !== 'tag' || seen.has(object.sha)) {
      break;
    }
    seen.add(object.sha);
    object = (await fetchGitHubJson<GitObject>(`/repos/${UPSTREAM_REPO}/git/tags/${object.sha}`)).object;
  }
  throw new Error(`Unable to resolve ${releaseTag} to one immutable commit`);
}

export function parseAssetDigest(digest: string | null | undefined): string {
  const match = digest?.match(/^sha256:([0-9a-f]{64})$/);
  if (!match?.[1]) {
    throw new Error('Exact spec bundle is missing a valid GitHub SHA-256 digest');
  }
  return validateBundleSha256(match[1]);
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Download file from URL to destination
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (downloadUrl: string, redirectsRemaining: number): void => {
      https
        .get(downloadUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location;
            response.resume();
            if (redirectUrl && redirectsRemaining > 0) {
              request(redirectUrl, redirectsRemaining - 1);
              return;
            }
            reject(new Error('Download redirect was missing a location or exceeded the limit'));
            return;
          }

          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`Download failed with status ${response.statusCode}`));
            return;
          }

          const file = fs.createWriteStream(dest);
          response.on('error', reject);
          file.on('error', reject);
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(dest, () => {
            /* ignore */
          });
          reject(err);
        });
    };

    request(url, 10);
  });
}

/**
 * Extract zip file using system unzip command
 */
function extractZip(zipPath: string, destDir: string): void {
  // Ensure destination exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Use unzip command (available on macOS, Linux, and Windows with Git Bash)
  try {
    execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`Failed to extract zip: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/**
 * Copy extracted specs to the specs directory
 */
function copySpecs(extractDir: string, specsDir: string): void {
  const files = fs.readdirSync(extractDir);

  // Find and copy JSON files
  for (const file of files) {
    const srcPath = path.join(extractDir, file);
    const stat = fs.statSync(srcPath);

    if (stat.isFile() && file.endsWith('.json')) {
      const destPath = path.join(specsDir, file);
      fs.copyFileSync(srcPath, destPath);
      console.log(`  Copied: ${file}`);
    } else if (stat.isDirectory() && file === 'domains') {
      // Copy domains directory
      const domainsDir = path.join(specsDir, 'domains');
      if (!fs.existsSync(domainsDir)) {
        fs.mkdirSync(domainsDir, { recursive: true });
      }
      const domainFiles = fs.readdirSync(srcPath);
      for (const domainFile of domainFiles) {
        if (domainFile.endsWith('.json')) {
          fs.copyFileSync(path.join(srcPath, domainFile), path.join(domainsDir, domainFile));
        }
      }
      console.log(`  Copied: domains/ (${domainFiles.length} files)`);
    }
  }
}

/**
 * Convert openapi.json to openapi.yaml
 */
function generateYaml(): void {
  try {
    const openapiPath = path.join(SPECS_DIR, 'openapi.json');
    const yamlPath = path.join(SPECS_DIR, 'openapi.yaml');

    if (!fs.existsSync(openapiPath)) {
      console.log('  Skipping YAML generation (no openapi.json)');
      return;
    }

    // Use dynamic import for yaml package
    const yaml = require('yaml') as { stringify: (obj: unknown) => string };
    const content = fs.readFileSync(openapiPath, 'utf-8');
    const json = JSON.parse(content) as unknown;
    const yamlContent = yaml.stringify(json);
    fs.writeFileSync(yamlPath, yamlContent);
    console.log('  Generated: openapi.yaml');
  } catch {
    console.log('  Skipping YAML generation (yaml package not available)');
  }
}

/**
 * Clean up temporary files
 */
function cleanup(tempDir: string, zipPath: string): void {
  try {
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Main sync function
 */
async function syncSpecs(): Promise<void> {
  const requested = resolveSpecDelivery();
  if (requested.alreadyProcessed) {
    throw new Error(`Delivery ${requested.deliveryId} was already processed`);
  }
  console.log(`🔄 Fetching exact release ${requested.releaseTag}...`);

  const release = await fetchReleaseByTag(requested.releaseTag);
  if (release.tag_name !== requested.releaseTag) {
    throw new Error(`GitHub returned ${release.tag_name}, expected ${requested.releaseTag}`);
  }
  const version = requested.version;
  console.log(`📦 Pinned version: ${version}`);

  const tagCommit = await fetchTagCommit(requested.releaseTag);
  if (tagCommit !== requested.targetCommit) {
    throw new Error(`Release tag ${requested.releaseTag} resolves to ${tagCommit}, expected ${requested.targetCommit}`);
  }

  // Select the one version-qualified bundle from the exact tagged release.
  const bundleName = expectedBundleName(requested);
  const zipAsset = release.assets.find((asset) => asset.name === bundleName);
  if (!zipAsset) {
    throw new Error(`Release ${requested.releaseTag} has no ${bundleName} asset`);
  }
  const releaseBundleSha256 = parseAssetDigest(zipAsset.digest);
  const workflowBundleSha256 = process.env.SPEC_EXPECTED_BUNDLE_SHA256;
  if (workflowBundleSha256) {
    validateBundleSha256(workflowBundleSha256);
  }
  if (requested.bundleSha256 && workflowBundleSha256 && requested.bundleSha256 !== workflowBundleSha256) {
    throw new Error('Tracked and workflow-provided bundle SHA-256 values disagree');
  }
  const expectedBundleSha256 = requested.bundleSha256 ?? workflowBundleSha256;
  if (expectedBundleSha256 && releaseBundleSha256 !== expectedBundleSha256) {
    throw new Error(`Release asset SHA-256 ${releaseBundleSha256} disagrees with pinned ${expectedBundleSha256}`);
  }

  const specsParent = path.dirname(SPECS_DIR);
  fs.mkdirSync(specsParent, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(specsParent, '.api-sync-'));
  const zipPath = path.join(tempDir, 'specs.zip');
  const extractDir = path.join(tempDir, 'extracted');

  try {
    // Download zip
    console.log('⬇️  Downloading specs...');
    await downloadFile(zipAsset.browser_download_url, zipPath);
    const downloadedBundleSha256 = sha256File(zipPath);
    if (downloadedBundleSha256 !== releaseBundleSha256) {
      throw new Error(
        `Downloaded bundle SHA-256 ${downloadedBundleSha256} disagrees with GitHub ${releaseBundleSha256}`,
      );
    }

    // Extract
    console.log('📂 Extracting...');
    extractZip(zipPath, extractDir);

    // Promote a complete replacement. Copying over the previous release leaves
    // retired domain files behind, so the same release can produce different
    // generation results depending on workstation history.
    const stagedSpecs = path.join(tempDir, 'staged');
    fs.mkdirSync(stagedSpecs, { recursive: true });
    console.log('📋 Staging specs...');
    copySpecs(extractDir, stagedSpecs);

    // Enforce presence of the authoritative namespace profiles map. It is the
    // single source of truth for which resource types may exist in which
    // namespaces; a release without it cannot build a correct resource tree.
    const namespaceProfilesPath = path.join(stagedSpecs, 'domains', 'namespace_profiles.json');
    if (!fs.existsSync(namespaceProfilesPath)) {
      throw new Error(
        'Synced release is missing required domains/namespace_profiles.json — upstream release is invalid.',
      );
    }
    const resourceCoveragePath = path.join(stagedSpecs, 'domains', 'resource_coverage.json');
    if (!fs.existsSync(resourceCoveragePath)) {
      throw new Error(
        'Synced release is missing required domains/resource_coverage.json — upstream release is invalid.',
      );
    }

    const openapiPath = path.join(stagedSpecs, 'openapi.json');
    if (!fs.existsSync(openapiPath)) {
      throw new Error(`Synced release ${requested.releaseTag} is missing openapi.json`);
    }
    const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8')) as {
      info?: { version?: string };
    };
    if (openapi.info?.version !== version) {
      throw new Error(
        `Downloaded openapi.json version ${openapi.info?.version ?? 'missing'} disagrees with ${requested.releaseTag}`,
      );
    }

    const indexPath = path.join(stagedSpecs, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { version?: string };
    if (index.version !== version) {
      throw new Error(
        `Downloaded index.json version ${index.version ?? 'missing'} disagrees with ${requested.releaseTag}`,
      );
    }

    loadResourceCoverage(resourceCoveragePath, version);

    const domainDir = path.join(stagedSpecs, 'domains');
    for (const filename of fs.readdirSync(domainDir).filter((name) => name.endsWith('.json'))) {
      const document = JSON.parse(fs.readFileSync(path.join(domainDir, filename), 'utf8')) as {
        openapi?: string;
        info?: { version?: string };
        version?: string;
      };
      if (document.openapi && document.info?.version !== version) {
        throw new Error(
          `Downloaded domains/${filename} version ${document.info?.version ?? 'missing'} disagrees with ${requested.releaseTag}`,
        );
      }
      if (filename === 'namespace_profiles.json' && document.version !== version) {
        throw new Error(
          `Downloaded domains/${filename} version ${document.version ?? 'missing'} disagrees with ${requested.releaseTag}`,
        );
      }
      if (filename === 'resource_coverage.json' && document.version !== version) {
        throw new Error(
          `Downloaded domains/${filename} version ${document.version ?? 'missing'} disagrees with ${requested.releaseTag}`,
        );
      }
    }

    const previousSpecs = path.join(tempDir, 'previous');
    if (fs.existsSync(SPECS_DIR)) {
      fs.renameSync(SPECS_DIR, previousSpecs);
    }
    try {
      fs.renameSync(stagedSpecs, SPECS_DIR);
    } catch (error) {
      if (fs.existsSync(previousSpecs) && !fs.existsSync(SPECS_DIR)) {
        fs.renameSync(previousSpecs, SPECS_DIR);
      }
      throw error;
    }

    // Generate YAML
    generateYaml();

    const treeSha256 = computeSpecTreeSha256(SPECS_DIR);
    const localState: LocalSpecState = {
      bundle_sha256: downloadedBundleSha256,
      release_tag: requested.releaseTag,
      target_commit: tagCommit,
      tree_sha256: treeSha256,
      version,
    };
    fs.writeFileSync(path.join(SPECS_DIR, SPEC_STATE_FILENAME), `${JSON.stringify(localState, null, 2)}\n`, 'utf8');

    const resolutionOutput = process.env.SPEC_RESOLUTION_OUTPUT;
    if (resolutionOutput) {
      fs.writeFileSync(resolutionOutput, `${JSON.stringify(localState, null, 2)}\n`, 'utf8');
    }

    console.log(`✅ Specs synced to version ${version}`);
  } finally {
    // Cleanup
    cleanup(tempDir, zipPath);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
F5 XC API Spec Sync

Downloads and extracts the pinned API specification release from upstream.

Usage:
  npx ts-node scripts/sync-specs.ts [options]

Options:
  --force   Force sync even if already up-to-date
  --help    Show this help message

The exact release is read from tools/spec-release.json, or from the validated
repository_dispatch contract in CI. There is no latest-release fallback.
`);
    return;
  }

  await syncSpecs();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('❌ Sync failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
