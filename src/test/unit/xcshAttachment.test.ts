// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { buildAttachmentName, MAX_ATTACHMENT_BYTES } from '../../xcsh/attachment';

describe('buildAttachmentName', () => {
  it('combines resource name and type into a .json filename', () => {
    expect(buildAttachmentName('http_loadbalancers', 'acme-bankexample-lb')).toBe(
      'acme-bankexample-lb.http_loadbalancers.json',
    );
  });

  it('collapses filename-unsafe characters to dashes', () => {
    expect(buildAttachmentName('origin_pool', 'my pool/v2')).toBe('my-pool-v2.origin_pool.json');
  });

  it('trims leading/trailing dashes introduced by sanitisation', () => {
    expect(buildAttachmentName('service_policy', '  spaced  ')).toBe('spaced.service_policy.json');
  });

  it('falls back to a generic name when the resource name is empty', () => {
    expect(buildAttachmentName('app_firewall', '')).toBe('resource.app_firewall.json');
  });

  it('omits the type segment when the resource type is empty', () => {
    expect(buildAttachmentName('', 'lonely')).toBe('lonely.json');
  });
});

describe('MAX_ATTACHMENT_BYTES', () => {
  it('matches the 512 KB file-picker guard', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(512 * 1024);
  });
});
