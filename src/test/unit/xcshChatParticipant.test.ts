// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { F5XCContext } from '../../config/contextTypes';
import { buildPromptWithContext } from '../../xcsh/chatParticipant';

describe('buildPromptWithContext', () => {
  const baseContext: F5XCContext = {
    name: 'prod-tenant',
    apiUrl: 'https://acme.console.ves.volterra.io/api',
    apiToken: 'secret-token',
    defaultNamespace: 'app-ns',
  };

  it('includes context name and namespace', () => {
    const result = buildPromptWithContext('Deploy my app', baseContext);
    expect(result).toContain('prod-tenant');
    expect(result).toContain('app-ns');
  });

  it('includes file context when provided', () => {
    const result = buildPromptWithContext('Explain this config', baseContext, {
      currentFile: '/workspace/lb.json',
      selection: '{"name": "my-lb"}',
    });
    expect(result).toContain('/workspace/lb.json');
    expect(result).toContain('{"name": "my-lb"}');
  });

  it('works without optional context', () => {
    const result = buildPromptWithContext('Hello world', null);
    expect(result).toContain('Hello world');
    expect(typeof result).toBe('string');
  });

  it('works with context but no file info', () => {
    const result = buildPromptWithContext('List my load balancers', baseContext);
    expect(result).toContain('List my load balancers');
    expect(result).toContain('prod-tenant');
    // Should not contain file-related sections when no file info provided
    expect(result).not.toContain('Current file:');
  });
});
