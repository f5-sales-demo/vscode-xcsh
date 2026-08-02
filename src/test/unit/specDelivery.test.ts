// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  computeSpecTreeSha256,
  type DispatchPayload,
  deliveryId,
  localSpecsMatchDelivery,
  marketplaceVersionForPublication,
  resolveSpecDelivery,
  TARGET_REPOSITORY,
  UPSTREAM_REPOSITORY,
  validateDispatch,
  validateRelease,
} from '../../../scripts/spec-delivery';
import { expectedBundleName, parseAssetDigest, releaseApiPath } from '../../../scripts/sync-specs';

const TARGET_COMMIT = 'a'.repeat(40);
const EXPECTED_DELIVERY_ID = '7cb2102f09390ee13c2d0431738c3a782daf3d5d69ae1b9bdadc159db15c08a9';
const BUNDLE_SHA256 = 'c'.repeat(64);
const PINNED_COMMIT = 'd'.repeat(40);

function payload(overrides: Partial<DispatchPayload> = {}): DispatchPayload {
  return {
    deliveryId: EXPECTED_DELIVERY_ID,
    releaseTag: 'v2.1.208',
    version: '2.1.208',
    targetCommit: TARGET_COMMIT,
    triggerSource: UPSTREAM_REPOSITORY,
    targetRepository: TARGET_REPOSITORY,
    ...overrides,
  };
}

function fixtureFiles(deliveries: Record<string, object> = {}): {
  directory: string;
  release: string;
  ledger: string;
  pending: string;
  publications: string;
} {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-xcsh-spec-delivery-'));
  const release = path.join(directory, 'spec-release.json');
  const ledger = path.join(directory, 'spec-deliveries.json');
  const pending = path.join(directory, 'spec-delivery-pending.json');
  const publications = path.join(directory, 'spec-publications.json');
  fs.writeFileSync(
    release,
    JSON.stringify({
      bundle_sha256: BUNDLE_SHA256,
      release_tag: 'v2.1.207',
      target_commit: PINNED_COMMIT,
      version: '2.1.207',
    }),
  );
  fs.writeFileSync(ledger, JSON.stringify({ deliveries, version: 1 }));
  fs.writeFileSync(
    publications,
    JSON.stringify({
      publications: Object.fromEntries(
        Object.keys(deliveries).map((identifier) => [
          identifier,
          {
            bundle_sha256: BUNDLE_SHA256,
            marketplace_sha256: 'e'.repeat(64),
            marketplace_version: '2.2608.1120000',
            open_vsx_sha256: 'e'.repeat(64),
            open_vsx_version: '2.2608.1120000',
            publication_epoch: '1785585600',
            publication_tag: 'v2.1.208-260801120000',
            vsix_name: 'xcsh-2.2608.11200.vsix',
            vsix_sha256: 'e'.repeat(64),
          },
        ]),
      ),
      version: 1,
    }),
  );
  return { directory, release, ledger, pending, publications };
}

function dispatchEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_EVENT_NAME: 'repository_dispatch',
    GITHUB_REPOSITORY: TARGET_REPOSITORY,
    SPEC_DISPATCH_ACTION: 'enriched-specs-updated',
    SPEC_DELIVERY_ID: EXPECTED_DELIVERY_ID,
    SPEC_RELEASE_TAG: 'v2.1.208',
    SPEC_RELEASE_VERSION: '2.1.208',
    SPEC_TARGET_COMMIT: TARGET_COMMIT,
    SPEC_TRIGGER_SOURCE: UPSTREAM_REPOSITORY,
    ...overrides,
  };
}

describe('immutable spec delivery contract', () => {
  it('computes the same canonical delivery ID as the upstream publisher', () => {
    expect(deliveryId(payload())).toBe(EXPECTED_DELIVERY_ID);
    expect(validateDispatch(payload())).toEqual(payload());
  });

  it('rejects mutable or inconsistent release identities', () => {
    expect(() => validateRelease({ releaseTag: 'latest', version: '2.1.208' })).toThrow(
      'spec release tag must be vMAJOR.MINOR.PATCH',
    );
    expect(() => validateRelease({ releaseTag: 'v2.1.209', version: '2.1.208' })).toThrow(
      'spec release tag and version disagree',
    );
    expect(() => validateDispatch(payload({ deliveryId: '0'.repeat(64) }))).toThrow('delivery_id does not match');
  });

  it('orders arbitrarily large semantic versions without number precision loss', () => {
    const files = fixtureFiles();
    fs.writeFileSync(
      files.release,
      JSON.stringify({
        bundle_sha256: BUNDLE_SHA256,
        release_tag: 'v9007199254740992.1.1',
        target_commit: PINNED_COMMIT,
        version: '9007199254740992.1.1',
      }),
    );
    const newer = payload({
      deliveryId: '',
      releaseTag: 'v9007199254740993.1.1',
      version: '9007199254740993.1.1',
    });
    newer.deliveryId = deliveryId(newer);
    expect(
      resolveSpecDelivery(
        dispatchEnvironment({
          SPEC_DELIVERY_ID: newer.deliveryId,
          SPEC_RELEASE_TAG: newer.releaseTag,
          SPEC_RELEASE_VERSION: newer.version,
        }),
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toMatchObject({ alreadyProcessed: false, version: newer.version });
  });

  it('requires every repository_dispatch field and rejects stale delivery', () => {
    const files = fixtureFiles();
    expect(() =>
      resolveSpecDelivery(
        dispatchEnvironment({ SPEC_RELEASE_TAG: '' }),
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toThrow('release_tag is required');

    const stale = payload({ releaseTag: 'v2.1.206', version: '2.1.206', deliveryId: '' });
    stale.deliveryId = deliveryId(stale);
    expect(() =>
      resolveSpecDelivery(
        dispatchEnvironment({
          SPEC_DELIVERY_ID: stale.deliveryId,
          SPEC_RELEASE_TAG: stale.releaseTag,
          SPEC_RELEASE_VERSION: stale.version,
        }),
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toThrow('stale delivery');
  });

  it('rejects an equal-version dispatch that changes the pinned commit', () => {
    const files = fixtureFiles();
    const changed = payload({
      deliveryId: '',
      releaseTag: 'v2.1.207',
      targetCommit: TARGET_COMMIT,
      version: '2.1.207',
    });
    changed.deliveryId = deliveryId(changed);
    expect(() =>
      resolveSpecDelivery(
        dispatchEnvironment({
          SPEC_DELIVERY_ID: changed.deliveryId,
          SPEC_RELEASE_TAG: changed.releaseTag,
          SPEC_RELEASE_VERSION: changed.version,
        }),
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toThrow('already-pinned target commit');
  });

  it('stops an exactly repeated delivery before generation', () => {
    const record = {
      release_tag: 'v2.1.208',
      target_commit: TARGET_COMMIT,
      version: '2.1.208',
    };
    const files = fixtureFiles({ [EXPECTED_DELIVERY_ID]: record });
    expect(
      resolveSpecDelivery(dispatchEnvironment(), files.release, files.ledger, files.pending, files.publications),
    ).toMatchObject({
      alreadyProcessed: true,
      deliveryId: EXPECTED_DELIVERY_ID,
      releaseTag: 'v2.1.208',
    });
  });

  it('rejects publication versions that do not derive from the immutable tag epoch', () => {
    const record = {
      release_tag: 'v2.1.208',
      target_commit: TARGET_COMMIT,
      version: '2.1.208',
    };
    const files = fixtureFiles({ [EXPECTED_DELIVERY_ID]: record });
    const publications = JSON.parse(fs.readFileSync(files.publications, 'utf8')) as {
      publications: Record<string, { marketplace_version: string; open_vsx_version: string }>;
    };
    const publication = publications.publications[EXPECTED_DELIVERY_ID];
    if (!publication) {
      throw new Error('Expected publication fixture to contain the delivery ID');
    }
    publication.marketplace_version = '2.2608.1120001';
    publication.open_vsx_version = '2.2608.1120001';
    fs.writeFileSync(files.publications, JSON.stringify(publications));

    expect(() =>
      resolveSpecDelivery(dispatchEnvironment(), files.release, files.ledger, files.pending, files.publications),
    ).toThrow('marketplace version disagrees with publication identity');
    expect(marketplaceVersionForPublication('2.1.208', '1785585600')).toBe('2.2608.1120000');
  });

  it('rejects two canonical delivery IDs claiming the same immutable release tag', () => {
    const alternate = payload({ targetCommit: 'b'.repeat(40), deliveryId: '' });
    alternate.deliveryId = deliveryId(alternate);
    const files = fixtureFiles({
      [EXPECTED_DELIVERY_ID]: {
        release_tag: 'v2.1.208',
        target_commit: TARGET_COMMIT,
        version: '2.1.208',
      },
      [alternate.deliveryId]: {
        release_tag: 'v2.1.208',
        target_commit: alternate.targetCommit,
        version: '2.1.208',
      },
    });

    expect(() =>
      resolveSpecDelivery(dispatchEnvironment(), files.release, files.ledger, files.pending, files.publications),
    ).toThrow('is claimed by multiple delivery IDs');
  });

  it('rejects one release tag delivered under a different identity', () => {
    const alternate = payload({ targetCommit: 'b'.repeat(40), deliveryId: '' });
    alternate.deliveryId = deliveryId(alternate);
    const files = fixtureFiles({
      [alternate.deliveryId]: {
        release_tag: 'v2.1.208',
        target_commit: 'b'.repeat(40),
        version: '2.1.208',
      },
    });
    expect(() =>
      resolveSpecDelivery(dispatchEnvironment(), files.release, files.ledger, files.pending, files.publications),
    ).toThrow('under a different delivery_id');
  });

  it('uses the tracked pin for non-dispatch builds without querying latest', () => {
    const files = fixtureFiles();
    expect(
      resolveSpecDelivery(
        { GITHUB_EVENT_NAME: 'push' },
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toEqual({
      alreadyProcessed: false,
      bundleSha256: BUNDLE_SHA256,
      releaseTag: 'v2.1.207',
      targetCommit: PINNED_COMMIT,
      version: '2.1.207',
    });
  });

  it('does not treat an unrelated repository_dispatch as a spec delivery', () => {
    const files = fixtureFiles();
    expect(
      resolveSpecDelivery(
        { GITHUB_EVENT_NAME: 'repository_dispatch', SPEC_DISPATCH_ACTION: 'theme-updated' },
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toEqual({
      alreadyProcessed: false,
      bundleSha256: BUNDLE_SHA256,
      releaseTag: 'v2.1.207',
      targetCommit: PINNED_COMMIT,
      version: '2.1.207',
    });
  });

  it('carries a pending delivery through main publication without marking it applied', () => {
    const files = fixtureFiles();
    fs.writeFileSync(
      files.pending,
      JSON.stringify({
        delivery_id: EXPECTED_DELIVERY_ID,
        bundle_sha256: BUNDLE_SHA256,
        publication_epoch: '1785585600',
        publication_tag: 'v2.1.208-260801120000',
        release_tag: 'v2.1.208',
        target_commit: TARGET_COMMIT,
        trigger_source: UPSTREAM_REPOSITORY,
        version: '2.1.208',
      }),
    );
    fs.writeFileSync(
      files.release,
      JSON.stringify({
        bundle_sha256: BUNDLE_SHA256,
        release_tag: 'v2.1.208',
        target_commit: TARGET_COMMIT,
        version: '2.1.208',
      }),
    );

    expect(
      resolveSpecDelivery(
        { GITHUB_EVENT_NAME: 'push' },
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toEqual({
      alreadyProcessed: false,
      bundleSha256: BUNDLE_SHA256,
      deliveryId: EXPECTED_DELIVERY_ID,
      publicationEpoch: '1785585600',
      publicationTag: 'v2.1.208-260801120000',
      releaseTag: 'v2.1.208',
      targetCommit: TARGET_COMMIT,
      version: '2.1.208',
    });
    expect(
      resolveSpecDelivery(dispatchEnvironment(), files.release, files.ledger, files.pending, files.publications),
    ).toMatchObject({
      alreadyProcessed: true,
      deliveryId: EXPECTED_DELIVERY_ID,
    });
  });

  it('rejects a pending publication tag that disagrees with its version or epoch', () => {
    const files = fixtureFiles();
    fs.writeFileSync(
      files.pending,
      JSON.stringify({
        bundle_sha256: BUNDLE_SHA256,
        delivery_id: EXPECTED_DELIVERY_ID,
        publication_epoch: '1785585600',
        publication_tag: 'v9.9.9-260801120000',
        release_tag: 'v2.1.208',
        target_commit: TARGET_COMMIT,
        trigger_source: UPSTREAM_REPOSITORY,
        version: '2.1.208',
      }),
    );
    expect(() =>
      resolveSpecDelivery(
        { GITHUB_EVENT_NAME: 'push' },
        files.release,
        files.ledger,
        files.pending,
        files.publications,
      ),
    ).toThrow('publication tag disagrees');
  });

  it('detects same-version changes in the extracted spec tree', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-xcsh-spec-tree-'));
    const stateFile = path.join(directory, '.spec-resolution-state');
    fs.writeFileSync(path.join(directory, 'openapi.json'), '{"info":{"version":"2.1.207"}}');
    const delivery = {
      alreadyProcessed: false,
      bundleSha256: BUNDLE_SHA256,
      releaseTag: 'v2.1.207',
      targetCommit: PINNED_COMMIT,
      version: '2.1.207',
    };
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        bundle_sha256: BUNDLE_SHA256,
        release_tag: delivery.releaseTag,
        target_commit: delivery.targetCommit,
        tree_sha256: computeSpecTreeSha256(directory),
        version: delivery.version,
      }),
    );
    expect(localSpecsMatchDelivery(directory, stateFile, delivery)).toBe(true);
    fs.writeFileSync(path.join(directory, 'openapi.json'), '{"info":{"version":"changed"}}');
    expect(localSpecsMatchDelivery(directory, stateFile, delivery)).toBe(false);
  });

  it('addresses only the exact tagged bundle', () => {
    const release = { releaseTag: 'v2.1.208', version: '2.1.208' };
    expect(releaseApiPath(release.releaseTag)).toBe('/repos/f5-sales-demo/api-specs-enriched/releases/tags/v2.1.208');
    expect(expectedBundleName(release)).toBe('f5xc-api-specs-v2.1.208.zip');
    expect(parseAssetDigest(`sha256:${BUNDLE_SHA256}`)).toBe(BUNDLE_SHA256);
    expect(() => parseAssetDigest(undefined)).toThrow('missing a valid GitHub SHA-256');
  });
});
