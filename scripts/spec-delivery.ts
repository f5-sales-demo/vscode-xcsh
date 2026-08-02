// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateVersionInfo } from './version';

export const UPSTREAM_REPOSITORY = 'f5-sales-demo/api-specs-enriched';
export const TARGET_REPOSITORY = 'f5-sales-demo/vscode-xcsh';
export const DISPATCH_EVENT_TYPE = 'enriched-specs-updated';
export const SPEC_STATE_FILENAME = '.spec-resolution-state';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_RELEASE_FILE = path.join(PROJECT_ROOT, 'tools', 'spec-release.json');
const DEFAULT_LEDGER_FILE = path.join(PROJECT_ROOT, 'tools', 'spec-deliveries.json');
const DEFAULT_PENDING_FILE = path.join(PROJECT_ROOT, 'tools', 'spec-delivery-pending.json');
const DEFAULT_PUBLICATIONS_FILE = path.join(PROJECT_ROOT, 'tools', 'spec-publications.json');
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DELIVERY_PATTERN = /^[0-9a-f]{64}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PUBLICATION_TAG_PATTERN = /^v\d+\.\d+\.\d+-\d{12}(?:-BETA)?$/;
const VSIX_NAME_PATTERN = /^[A-Za-z0-9._-]+\.vsix$/;

export interface SpecVersion {
  releaseTag: string;
  version: string;
}

export interface SpecRelease extends SpecVersion {
  targetCommit: string;
  bundleSha256: string;
}

export interface DeliveryRecord {
  release_tag: string;
  target_commit: string;
  version: string;
}

interface DeliveryLedger {
  version: number;
  deliveries: Record<string, DeliveryRecord>;
}

interface PublicationEvidence {
  bundle_sha256: string;
  marketplace_sha256: string;
  marketplace_version: string;
  open_vsx_sha256: string;
  open_vsx_version: string;
  publication_epoch: string;
  publication_tag: string;
  vsix_name: string;
  vsix_sha256: string;
}

interface PublicationLedger {
  version: number;
  publications: Record<string, PublicationEvidence>;
}

interface PendingDelivery extends DeliveryRecord {
  bundle_sha256: string;
  delivery_id: string;
  publication_epoch: string;
  publication_tag: string;
  trigger_source: string;
}

export interface DispatchPayload extends SpecVersion {
  deliveryId: string;
  targetCommit: string;
  triggerSource: string;
  targetRepository: string;
}

export interface ResolvedSpecDelivery extends SpecVersion {
  alreadyProcessed: boolean;
  bundleSha256?: string;
  deliveryId?: string;
  publicationEpoch?: string;
  publicationTag?: string;
  targetCommit: string;
}

export interface LocalSpecState {
  bundle_sha256: string;
  release_tag: string;
  target_commit: string;
  tree_sha256: string;
  version: string;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function validateRelease<T extends SpecVersion>(release: T): T {
  if (!VERSION_PATTERN.test(release.version)) {
    throw new Error('spec version must be MAJOR.MINOR.PATCH');
  }
  if (!TAG_PATTERN.test(release.releaseTag)) {
    throw new Error('spec release tag must be vMAJOR.MINOR.PATCH');
  }
  if (release.releaseTag !== `v${release.version}`) {
    throw new Error('spec release tag and version disagree');
  }
  return release;
}

export function validateTargetCommit(targetCommit: string): string {
  if (!COMMIT_PATTERN.test(targetCommit)) {
    throw new Error('target_commit must be a full lowercase Git SHA');
  }
  return targetCommit;
}

export function validateBundleSha256(bundleSha256: string): string {
  if (!SHA256_PATTERN.test(bundleSha256)) {
    throw new Error('bundle_sha256 must be 64 lowercase hexadecimal characters');
  }
  return bundleSha256;
}

export function validatePublicationTag(publicationTag: string): string {
  if (!PUBLICATION_TAG_PATTERN.test(publicationTag)) {
    throw new Error('publication_tag must identify one timestamped extension release');
  }
  return publicationTag;
}

export function validatePublicationEpoch(publicationEpoch: string): string {
  if (!/^\d{1,12}$/.test(publicationEpoch)) {
    throw new Error('publication_epoch must be non-negative integer seconds');
  }
  const date = new Date(Number(publicationEpoch) * 1000);
  if (Number.isNaN(date.getTime())) {
    throw new Error('publication_epoch is outside the supported date range');
  }
  return publicationEpoch;
}

export function publicationTagFor(version: string, publicationEpoch: string): string {
  validateRelease({ releaseTag: `v${version}`, version });
  validatePublicationEpoch(publicationEpoch);
  const date = new Date(Number(publicationEpoch) * 1000);
  const part = (value: number): string => String(value).padStart(2, '0');
  const timestamp = `${String(date.getUTCFullYear()).slice(-2)}${part(date.getUTCMonth() + 1)}${part(
    date.getUTCDate(),
  )}${part(date.getUTCHours())}${part(date.getUTCMinutes())}${part(date.getUTCSeconds())}`;
  return `v${version}-${timestamp}`;
}

export function marketplaceVersionForPublication(version: string, publicationEpoch: string): string {
  const publicationTag = publicationTagFor(version, publicationEpoch);
  const timestamp = publicationTag.slice(publicationTag.lastIndexOf('-') + 1);
  return generateVersionInfo(false, { upstream: version, timestamp }).semver;
}

export function computeSpecTreeSha256(specsDir: string): string {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(absolute);
      }
    }
  };
  visit(specsDir);
  files.sort((left, right) => path.relative(specsDir, left).localeCompare(path.relative(specsDir, right), 'en'));
  const hash = createHash('sha256');
  for (const file of files) {
    const relative = path.relative(specsDir, file).split(path.sep).join('/');
    const content = fs.readFileSync(file);
    hash.update(`${Buffer.byteLength(relative)}:${relative}:${content.length}:`);
    hash.update(content);
  }
  return hash.digest('hex');
}

export function localSpecsMatchDelivery(specsDir: string, stateFile: string, delivery: ResolvedSpecDelivery): boolean {
  if (!delivery.bundleSha256 || !fs.existsSync(stateFile) || !fs.existsSync(specsDir)) {
    return false;
  }
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as Partial<LocalSpecState>;
    if (
      state.bundle_sha256 !== delivery.bundleSha256 ||
      state.release_tag !== delivery.releaseTag ||
      state.target_commit !== delivery.targetCommit ||
      state.version !== delivery.version ||
      typeof state.tree_sha256 !== 'string'
    ) {
      return false;
    }
    validateBundleSha256(state.tree_sha256);
    return computeSpecTreeSha256(specsDir) === state.tree_sha256;
  } catch {
    return false;
  }
}

export function compareVersions(left: string, right: string): number {
  const lhs = validateRelease({ releaseTag: `v${left}`, version: left })
    .version.split('.')
    .map(BigInt);
  const rhs = validateRelease({ releaseTag: `v${right}`, version: right })
    .version.split('.')
    .map(BigInt);
  for (let index = 0; index < 3; index += 1) {
    const leftPart = lhs[index] ?? 0n;
    const rightPart = rhs[index] ?? 0n;
    if (leftPart < rightPart) {
      return -1;
    }
    if (leftPart > rightPart) {
      return 1;
    }
  }
  return 0;
}

export function deliveryId(payload: Omit<DispatchPayload, 'deliveryId'>): string {
  const identity = {
    commit: payload.targetCommit,
    event_type: DISPATCH_EVENT_TYPE,
    source: payload.triggerSource,
    tag: payload.releaseTag,
    target: payload.targetRepository,
    version: payload.version,
  };
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function validateDispatch(payload: DispatchPayload): DispatchPayload {
  validateRelease(payload);
  if (!DELIVERY_PATTERN.test(payload.deliveryId)) {
    throw new Error('delivery_id must be 64 lowercase hexadecimal characters');
  }
  validateTargetCommit(payload.targetCommit);
  if (payload.triggerSource !== UPSTREAM_REPOSITORY) {
    throw new Error(`trigger_source must be ${UPSTREAM_REPOSITORY}`);
  }
  if (payload.targetRepository !== TARGET_REPOSITORY) {
    throw new Error(`target repository must be ${TARGET_REPOSITORY}`);
  }
  if (deliveryId(payload) !== payload.deliveryId) {
    throw new Error('delivery_id does not match the dispatched release identity');
  }
  return payload;
}

function parseReleaseFile(file: string): SpecRelease {
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    bundle_sha256?: unknown;
    release_tag?: unknown;
    target_commit?: unknown;
    version?: unknown;
  };
  if (
    typeof document.bundle_sha256 !== 'string' ||
    typeof document.release_tag !== 'string' ||
    typeof document.target_commit !== 'string' ||
    typeof document.version !== 'string'
  ) {
    throw new Error(`${path.relative(PROJECT_ROOT, file)} is malformed`);
  }
  return {
    ...validateRelease({ releaseTag: document.release_tag, version: document.version }),
    bundleSha256: validateBundleSha256(document.bundle_sha256),
    targetCommit: validateTargetCommit(document.target_commit),
  };
}

function parseLedger(file: string): DeliveryLedger {
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<DeliveryLedger>;
  if (document.version !== 1 || typeof document.deliveries !== 'object' || document.deliveries === null) {
    throw new Error(`${path.relative(PROJECT_ROOT, file)} is malformed`);
  }
  const ledger = document as DeliveryLedger;
  for (const [identifier, record] of Object.entries(ledger.deliveries)) {
    if (
      typeof record?.release_tag !== 'string' ||
      typeof record?.target_commit !== 'string' ||
      typeof record?.version !== 'string'
    ) {
      throw new Error(`${path.relative(PROJECT_ROOT, file)} has a malformed delivery record`);
    }
    validateDispatch({
      deliveryId: identifier,
      releaseTag: record.release_tag,
      targetCommit: record.target_commit,
      triggerSource: UPSTREAM_REPOSITORY,
      targetRepository: TARGET_REPOSITORY,
      version: record.version,
    });
  }
  return ledger;
}

function parsePublications(file: string): PublicationLedger {
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<PublicationLedger>;
  if (document.version !== 1 || typeof document.publications !== 'object' || document.publications === null) {
    throw new Error(`${path.relative(PROJECT_ROOT, file)} is malformed`);
  }
  const ledger = document as PublicationLedger;
  for (const [identifier, evidence] of Object.entries(ledger.publications)) {
    if (!DELIVERY_PATTERN.test(identifier)) {
      throw new Error(`${path.relative(PROJECT_ROOT, file)} has an invalid delivery_id`);
    }
    if (
      typeof evidence?.bundle_sha256 !== 'string' ||
      typeof evidence?.marketplace_sha256 !== 'string' ||
      typeof evidence?.marketplace_version !== 'string' ||
      typeof evidence?.open_vsx_sha256 !== 'string' ||
      typeof evidence?.open_vsx_version !== 'string' ||
      typeof evidence?.publication_epoch !== 'string' ||
      typeof evidence?.publication_tag !== 'string' ||
      typeof evidence?.vsix_name !== 'string' ||
      typeof evidence?.vsix_sha256 !== 'string'
    ) {
      throw new Error(`${path.relative(PROJECT_ROOT, file)} has malformed publication evidence`);
    }
    validateBundleSha256(evidence.bundle_sha256);
    validateBundleSha256(evidence.marketplace_sha256);
    validateBundleSha256(evidence.open_vsx_sha256);
    validateBundleSha256(evidence.vsix_sha256);
    validatePublicationEpoch(evidence.publication_epoch);
    if (
      !VERSION_PATTERN.test(evidence.marketplace_version) ||
      evidence.marketplace_version !== evidence.open_vsx_version
    ) {
      throw new Error(`${path.relative(PROJECT_ROOT, file)} has inconsistent marketplace versions`);
    }
    if (evidence.marketplace_sha256 !== evidence.vsix_sha256 || evidence.open_vsx_sha256 !== evidence.vsix_sha256) {
      throw new Error(`${path.relative(PROJECT_ROOT, file)} has inconsistent publication hashes`);
    }
    if (!PUBLICATION_TAG_PATTERN.test(evidence.publication_tag)) {
      throw new Error(`${path.relative(PROJECT_ROOT, file)} has an invalid publication tag`);
    }
    if (!VSIX_NAME_PATTERN.test(evidence.vsix_name)) {
      throw new Error(`${path.relative(PROJECT_ROOT, file)} has an invalid VSIX name`);
    }
  }
  return ledger;
}

function parsePending(file: string):
  | (DispatchPayload & {
      bundleSha256: string;
      publicationEpoch: string;
      publicationTag: string;
    })
  | undefined {
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const document = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<PendingDelivery>;
  if (
    typeof document.bundle_sha256 !== 'string' ||
    typeof document.delivery_id !== 'string' ||
    typeof document.publication_epoch !== 'string' ||
    typeof document.publication_tag !== 'string' ||
    typeof document.release_tag !== 'string' ||
    typeof document.target_commit !== 'string' ||
    typeof document.trigger_source !== 'string' ||
    typeof document.version !== 'string'
  ) {
    throw new Error(`${path.relative(PROJECT_ROOT, file)} is malformed`);
  }
  const payload = validateDispatch({
    deliveryId: document.delivery_id,
    releaseTag: document.release_tag,
    targetCommit: document.target_commit,
    triggerSource: document.trigger_source,
    targetRepository: TARGET_REPOSITORY,
    version: document.version,
  });
  const publicationEpoch = validatePublicationEpoch(document.publication_epoch);
  const publicationTag = validatePublicationTag(document.publication_tag);
  if (publicationTag !== publicationTagFor(payload.version, publicationEpoch)) {
    throw new Error('pending publication tag disagrees with its version or epoch');
  }
  return {
    ...payload,
    bundleSha256: validateBundleSha256(document.bundle_sha256),
    publicationEpoch,
    publicationTag,
  };
}

function recordMatches(record: DeliveryRecord, payload: DispatchPayload): boolean {
  return (
    record.release_tag === payload.releaseTag &&
    record.target_commit === payload.targetCommit &&
    record.version === payload.version
  );
}

export function resolveSpecDelivery(
  environment: NodeJS.ProcessEnv = process.env,
  releaseFile = DEFAULT_RELEASE_FILE,
  ledgerFile = DEFAULT_LEDGER_FILE,
  pendingFile = DEFAULT_PENDING_FILE,
  publicationsFile = DEFAULT_PUBLICATIONS_FILE,
): ResolvedSpecDelivery {
  const pinned = parseReleaseFile(releaseFile);
  const ledger = parseLedger(ledgerFile);
  const pending = parsePending(pendingFile);
  const publicationLedger = parsePublications(publicationsFile);
  const deliveryByReleaseTag = new Map<string, string>();
  for (const [identifier, delivery] of Object.entries(ledger.deliveries)) {
    const priorIdentifier = deliveryByReleaseTag.get(delivery.release_tag);
    if (priorIdentifier && priorIdentifier !== identifier) {
      throw new Error(`${delivery.release_tag} is claimed by multiple delivery IDs`);
    }
    deliveryByReleaseTag.set(delivery.release_tag, identifier);
    const evidence = publicationLedger.publications[identifier];
    if (!evidence) {
      throw new Error(`delivery ${identifier} has no durable publication evidence`);
    }
    if (evidence.publication_tag !== publicationTagFor(delivery.version, evidence.publication_epoch)) {
      throw new Error(`delivery ${identifier} has inconsistent publication identity`);
    }
    const marketplaceVersion = marketplaceVersionForPublication(delivery.version, evidence.publication_epoch);
    if (evidence.marketplace_version !== marketplaceVersion || evidence.open_vsx_version !== marketplaceVersion) {
      throw new Error(`delivery ${identifier} marketplace version disagrees with publication identity`);
    }
    if (
      delivery.release_tag === pinned.releaseTag &&
      (delivery.target_commit !== pinned.targetCommit ||
        delivery.version !== pinned.version ||
        evidence.bundle_sha256 !== pinned.bundleSha256)
    ) {
      throw new Error(`delivery ${identifier} disagrees with the tracked release pin`);
    }
  }
  for (const identifier of Object.keys(publicationLedger.publications)) {
    if (!ledger.deliveries[identifier]) {
      throw new Error(`publication ${identifier} has no applied-delivery ledger entry`);
    }
  }
  const isSpecDispatch =
    environment.GITHUB_EVENT_NAME === 'repository_dispatch' && environment.SPEC_DISPATCH_ACTION === DISPATCH_EVENT_TYPE;
  if (!isSpecDispatch) {
    if (pending) {
      if (
        pending.releaseTag !== pinned.releaseTag ||
        pending.version !== pinned.version ||
        pending.targetCommit !== pinned.targetCommit ||
        pending.bundleSha256 !== pinned.bundleSha256
      ) {
        throw new Error('pending delivery disagrees with the tracked release pin');
      }
      if (ledger.deliveries[pending.deliveryId]) {
        throw new Error('pending delivery is already present in the applied-delivery ledger');
      }
      return {
        ...pinned,
        alreadyProcessed: false,
        bundleSha256: pinned.bundleSha256,
        deliveryId: pending.deliveryId,
        publicationEpoch: pending.publicationEpoch,
        publicationTag: pending.publicationTag,
        targetCommit: pending.targetCommit,
      };
    }
    return { ...pinned, alreadyProcessed: false };
  }

  const payload = validateDispatch({
    deliveryId: required(environment.SPEC_DELIVERY_ID, 'delivery_id'),
    releaseTag: required(environment.SPEC_RELEASE_TAG, 'release_tag'),
    version: required(environment.SPEC_RELEASE_VERSION, 'version'),
    targetCommit: required(environment.SPEC_TARGET_COMMIT, 'target_commit'),
    triggerSource: required(environment.SPEC_TRIGGER_SOURCE, 'trigger_source'),
    targetRepository: environment.GITHUB_REPOSITORY || TARGET_REPOSITORY,
  });
  const workflowBundleSha256 = environment.SPEC_EXPECTED_BUNDLE_SHA256
    ? validateBundleSha256(environment.SPEC_EXPECTED_BUNDLE_SHA256)
    : undefined;
  const pinnedComparison = compareVersions(payload.version, pinned.version);
  if (pinnedComparison < 0) {
    throw new Error(`stale delivery ${payload.releaseTag} cannot replace ${pinned.releaseTag}`);
  }
  if (pinnedComparison === 0 && payload.targetCommit !== pinned.targetCommit) {
    throw new Error(`${payload.releaseTag} disagrees with the already-pinned target commit`);
  }
  if (pinnedComparison === 0 && workflowBundleSha256 && workflowBundleSha256 !== pinned.bundleSha256) {
    throw new Error(`${payload.releaseTag} disagrees with the already-pinned bundle SHA-256`);
  }

  const recorded = ledger.deliveries[payload.deliveryId];
  if (recorded) {
    if (!recordMatches(recorded, payload)) {
      throw new Error('recorded delivery identity disagrees with the dispatch');
    }
    const recordedBundleSha256 = publicationLedger.publications[payload.deliveryId]?.bundle_sha256;
    if (workflowBundleSha256 && recordedBundleSha256 && workflowBundleSha256 !== recordedBundleSha256) {
      throw new Error('recorded publication bundle SHA-256 disagrees with the workflow');
    }
    return {
      releaseTag: payload.releaseTag,
      version: payload.version,
      deliveryId: payload.deliveryId,
      targetCommit: payload.targetCommit,
      alreadyProcessed: true,
      bundleSha256: recordedBundleSha256,
    };
  }

  const sameTag = Object.entries(ledger.deliveries).find(
    ([identifier, record]) => identifier !== payload.deliveryId && record.release_tag === payload.releaseTag,
  );
  if (sameTag) {
    throw new Error(`${payload.releaseTag} was already recorded under a different delivery_id`);
  }

  if (pending) {
    if (pending.deliveryId === payload.deliveryId && deliveryId(pending) === deliveryId(payload)) {
      if (workflowBundleSha256 && workflowBundleSha256 !== pending.bundleSha256) {
        throw new Error('pending bundle SHA-256 disagrees with the workflow');
      }
      return {
        releaseTag: payload.releaseTag,
        version: payload.version,
        deliveryId: payload.deliveryId,
        targetCommit: payload.targetCommit,
        publicationEpoch: pending.publicationEpoch,
        publicationTag: pending.publicationTag,
        alreadyProcessed: true,
        bundleSha256: pending.bundleSha256,
      };
    }
    throw new Error(`delivery ${pending.deliveryId} is still pending publication`);
  }

  return {
    releaseTag: payload.releaseTag,
    version: payload.version,
    deliveryId: payload.deliveryId,
    targetCommit: payload.targetCommit,
    alreadyProcessed: false,
    bundleSha256: workflowBundleSha256,
  };
}

function writeGitHubOutput(delivery: ResolvedSpecDelivery): void {
  const output = required(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT');
  const values = [
    `process=${delivery.alreadyProcessed ? 'false' : 'true'}`,
    `release_tag=${delivery.releaseTag}`,
    `version=${delivery.version}`,
    `bundle_sha256=${delivery.bundleSha256 ?? ''}`,
    `delivery_id=${delivery.deliveryId ?? ''}`,
    `publication_epoch=${delivery.publicationEpoch ?? ''}`,
    `publication_tag=${delivery.publicationTag ?? ''}`,
    `target_commit=${delivery.targetCommit ?? ''}`,
  ];
  fs.appendFileSync(output, `${values.join('\n')}\n`, 'utf8');
}

if (require.main === module) {
  try {
    const delivery = resolveSpecDelivery();
    if (process.argv.includes('--github-output')) {
      writeGitHubOutput(delivery);
    } else {
      console.log(JSON.stringify(delivery));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
