// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { generateVersionInfo, parseTag } from '../../../scripts/version';

describe('parseTag', () => {
  it('parses a release tag into upstream + timestamp', () => {
    expect(parseTag('v2.1.179-2607161629')).toEqual({
      upstream: '2.1.179',
      timestamp: '2607161629',
      isBeta: false,
    });
  });

  it('detects the BETA suffix', () => {
    expect(parseTag('v2.1.179-2607161629-BETA')).toEqual({
      upstream: '2.1.179',
      timestamp: '2607161629',
      isBeta: true,
    });
  });

  it('returns null for a malformed tag', () => {
    expect(parseTag('not-a-tag')).toBeNull();
    expect(parseTag('v2.1.179')).toBeNull();
    expect(parseTag('2.1.179-2607161629')).toBeNull(); // missing leading v
  });
});

describe('generateVersionInfo with a tag override', () => {
  it('derives the semver deterministically from the tag (no fresh timestamp)', () => {
    const info = generateVersionInfo(false, { upstream: '2.1.179', timestamp: '2607161629' });
    expect(info.version).toBe('2.1.179-2607161629');
    // semver = {upstream major}.{YYMM}.{DDHHMM}
    expect(info.semver).toBe('2.2607.161629');
  });

  it('drops the leading zero in DDHHMM (integer patch segment)', () => {
    const info = generateVersionInfo(false, { upstream: '1.0.82', timestamp: '2601010516' });
    expect(info.semver).toBe('1.2601.10516');
  });

  it('round-trips a parsed tag to the matching semver', () => {
    const tag = 'v2.1.179-2607161629';
    const parsed = parseTag(tag);
    expect(parsed).not.toBeNull();
    const info = generateVersionInfo(parsed?.isBeta ?? false, {
      upstream: parsed?.upstream ?? '',
      timestamp: parsed?.timestamp ?? '',
    });
    expect(info.semver).toBe('2.2607.161629');
  });
});
