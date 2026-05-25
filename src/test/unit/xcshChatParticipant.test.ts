// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { F5XCContext } from '../../config/contextTypes';
import {
  buildFollowups,
  buildPromptWithContext,
  formatContextResponse,
  formatStatusResponse,
} from '../../xcsh/chatParticipant';

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

describe('formatStatusResponse', () => {
  it('groups connected services on one line with dot separator', () => {
    const integrations = {
      version: '18.77.2',
      model: { state: 'connected', provider: 'anthropic' },
      services: [
        { name: 'F5 XC Context', state: 'connected' as const },
        { name: 'GitHub', state: 'connected' as const },
      ],
    };
    const result = formatStatusResponse(integrations);
    expect(result).toContain('v18.77.2');
    expect(result).toContain('✅ F5 XC Context · ✅ GitHub');
    expect(result).toContain('All integrations connected.');
  });

  it('shows issues separately with human-readable labels and hints', () => {
    const integrations = {
      version: '1.0.0',
      model: { state: 'connected' },
      services: [
        { name: 'F5 XC Context', state: 'connected' as const },
        { name: 'GitLab', state: 'unauthenticated' as const, hint: 'Run: glab auth login' },
        { name: 'AWS', state: 'unavailable' as const },
      ],
    };
    const result = formatStatusResponse(integrations);
    expect(result).toContain('✅ F5 XC Context');
    expect(result).toContain('⚠️ **GitLab** — needs authentication');
    expect(result).toContain('`Run: glab auth login`');
    expect(result).toContain('⭘ **AWS** — not installed');
    expect(result).not.toContain('All integrations connected.');
  });

  it('uses Unicode icons not codicons', () => {
    const integrations = {
      version: '1.0.0',
      model: { state: 'connected' },
      services: [
        { name: 'A', state: 'connected' as const },
        { name: 'B', state: 'unauthenticated' as const },
        { name: 'C', state: 'unavailable' as const },
      ],
    };
    const result = formatStatusResponse(integrations);
    expect(result).toContain('✅');
    expect(result).toContain('⚠️');
    expect(result).toContain('⭘');
    expect(result).not.toContain('$(check)');
    expect(result).not.toContain('$(warning)');
    expect(result).not.toContain('$(circle-slash)');
  });

  it('handles all-issues case without connected summary line', () => {
    const integrations = {
      version: '1.0.0',
      model: { state: 'connected' },
      services: [{ name: 'GitLab', state: 'unauthenticated' as const }],
    };
    const result = formatStatusResponse(integrations);
    expect(result).not.toContain('All integrations connected.');
    expect(result).toContain('⚠️ **GitLab**');
  });
});

describe('formatContextResponse', () => {
  it('formats context as markdown', () => {
    const ctx: F5XCContext = {
      name: 'prod-acme',
      apiUrl: 'https://acme.console.ves.volterra.io/api',
      apiToken: 'secret',
      defaultNamespace: 'app-ns',
    };
    const result = formatContextResponse(ctx);
    expect(result).toContain('prod-acme');
    expect(result).toContain('acme.console.ves.volterra.io');
    expect(result).toContain('app-ns');
    expect(result).not.toContain('secret');
  });

  it('returns message when no context active', () => {
    const result = formatContextResponse(null);
    expect(result).toContain('No active');
  });
});

describe('buildFollowups', () => {
  it('returns resource followups for resource commands', () => {
    const followups = buildFollowups('resources');
    expect(followups.length).toBeGreaterThan(0);
    expect(followups.some((f) => f.prompt.includes('details'))).toBe(true);
  });

  it('returns status followups for status commands', () => {
    const followups = buildFollowups('status');
    expect(followups.length).toBeGreaterThan(0);
  });

  it('returns general followups for unknown commands', () => {
    const followups = buildFollowups(undefined);
    expect(followups.length).toBeGreaterThan(0);
  });
});
