// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { generateTimestamp, generateVersionInfo, parseTag } from '../../../scripts/version';

describe('deterministic release timestamp', () => {
  it('uses SOURCE_DATE_EPOCH seconds exactly', () => {
    expect(generateTimestamp('1785585600')).toBe('260801120000');
  });

  it('rejects malformed SOURCE_DATE_EPOCH', () => {
    expect(() => generateTimestamp('now')).toThrow('non-negative integer seconds');
  });
});

describe('parseTag', () => {
  it('parses a release tag into upstream + timestamp', () => {
    expect(parseTag('v2.1.179-260716162930')).toEqual({
      upstream: '2.1.179',
      timestamp: '260716162930',
      isBeta: false,
    });
  });

  it('detects the BETA suffix', () => {
    expect(parseTag('v2.1.179-260716162930-BETA')).toEqual({
      upstream: '2.1.179',
      timestamp: '260716162930',
      isBeta: true,
    });
  });

  it('returns null for a malformed tag', () => {
    expect(parseTag('not-a-tag')).toBeNull();
    expect(parseTag('v2.1.179')).toBeNull();
    expect(parseTag('2.1.179-260716162930')).toBeNull(); // missing leading v
  });
});

describe('generateVersionInfo with a tag override', () => {
  it('derives the semver deterministically from the tag (no fresh timestamp)', () => {
    const info = generateVersionInfo(false, { upstream: '2.1.179', timestamp: '260716162930' });
    expect(info.version).toBe('2.1.179-260716162930');
    // semver = {upstream major}.{YYMM}.{DDHHMMSS}
    expect(info.semver).toBe('2.2607.16162930');
  });

  it('drops the leading zero in DDHHMMSS (integer patch segment)', () => {
    const info = generateVersionInfo(false, { upstream: '1.0.82', timestamp: '260101051607' });
    expect(info.semver).toBe('1.2601.1051607');
  });

  it('round-trips a parsed tag to the matching semver', () => {
    const tag = 'v2.1.179-260716162930';
    const parsed = parseTag(tag);
    expect(parsed).not.toBeNull();
    const info = generateVersionInfo(parsed?.isBeta ?? false, {
      upstream: parsed?.upstream ?? '',
      timestamp: parsed?.timestamp ?? '',
    });
    expect(info.semver).toBe('2.2607.16162930');
  });
});
