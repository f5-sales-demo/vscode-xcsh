// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { XCSHContext } from '../../config/contextTypes';
import {
  buildFollowups,
  buildPromptWithContext,
  formatContextResponse,
  formatStatusResponse,
  PARTICIPANT_ID,
} from '../../xcsh/chatParticipant';

describe('buildPromptWithContext', () => {
  it('omits context identity', () => {
    const result = buildPromptWithContext('Deploy my app');
    expect(result).toBe('Deploy my app');
  });

  it('includes relative file context when provided', () => {
    const result = buildPromptWithContext('Explain this config', {
      currentFile: 'configs/lb.json',
      selection: '{"name": "my-lb"}',
    });
    expect(result).toContain('configs/lb.json');
    expect(result).toContain('{"name": "my-lb"}');
  });

  it('works without optional file context', () => {
    const result = buildPromptWithContext('Hello world');
    expect(result).toContain('Hello world');
    expect(typeof result).toBe('string');
  });

  it('does not add file sections when no file is selected', () => {
    const result = buildPromptWithContext('List my load balancers');
    expect(result).toBe('List my load balancers');
  });
});

describe('formatStatusResponse', () => {
  it('shows model provider and each service on its own line', () => {
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
    expect(result).toContain('**Model Provider**');
    expect(result).toContain('✅ anthropic');
    expect(result).toContain('✅ F5 XC Context');
    expect(result).toContain('✅ GitHub');
  });

  it('shows issues with human-readable labels and hints', () => {
    const integrations = {
      version: '1.0.0',
      model: { state: 'connected', provider: 'anthropic' },
      services: [
        { name: 'F5 XC Context', state: 'connected' as const },
        { name: 'GitLab', state: 'unauthenticated' as const, hint: 'Run: glab auth login' },
        { name: 'AWS', state: 'unavailable' as const },
      ],
    };
    const result = formatStatusResponse(integrations);
    expect(result).toContain('✅ F5 XC Context');
    expect(result).toContain('⚠️ GitLab — needs authentication');
    expect(result).toContain('`Run: glab auth login`');
    expect(result).toContain('⭘ AWS — not installed');
  });

  it('uses Unicode icons not codicons', () => {
    const integrations = {
      version: '1.0.0',
      model: { state: 'connected', provider: 'anthropic' },
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

  it('shows model provider warning when not connected', () => {
    const integrations = {
      version: '1.0.0',
      model: { state: 'error' },
      services: [{ name: 'GitLab', state: 'unauthenticated' as const }],
    };
    const result = formatStatusResponse(integrations);
    expect(result).toContain('⚠️ unknown');
    expect(result).toContain('⚠️ GitLab');
  });
});

describe('formatContextResponse', () => {
  it('reports configured state without context values', () => {
    const ctx: XCSHContext = {
      name: 'prod-example-corp',
      apiUrl: 'https://example-corp.console.ves.volterra.io/api',
      apiToken: 'secret',
      defaultNamespace: 'app-ns',
    };
    const result = formatContextResponse(ctx);
    expect(result).toContain('Active Context:** Configured');
    expect(result).toContain('API credentials:** Configured');
    expect(result).toContain('Namespace name:** Configured');
    expect(result).not.toContain(ctx.name);
    expect(result).not.toContain(ctx.apiUrl);
    expect(result).not.toContain(ctx.apiToken);
    expect(result).not.toContain(ctx.defaultNamespace);
  });

  it('reports web-console credentials without environment values', () => {
    const ctx: XCSHContext = {
      name: 'prod-example-corp',
      apiUrl: 'https://example-corp.console.ves.volterra.io/api',
      apiToken: 'secret',
      defaultNamespace: 'app-ns',
      env: {
        XCSH_USERNAME: 'console-user@example.com',
        XCSH_CONSOLE_PASSWORD: 'supersecretpass',
        XCSH_EMAIL: 'user@example.com',
      },
    };
    const result = formatContextResponse(ctx);
    expect(result).toContain('Web-console credentials:** Configured');
    for (const value of Object.values(ctx.env ?? {})) {
      expect(result).not.toContain(value);
    }
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

  it('returns status followups with cross-command prompts', () => {
    const followups = buildFollowups('status');
    expect(followups.length).toBe(2);
    expect(followups[0]?.label).toBe('View Context');
    expect(followups[1]?.label).toBe('List Resources');
  });

  it('returns general followups for unknown commands', () => {
    const followups = buildFollowups(undefined);
    expect(followups.length).toBeGreaterThan(0);
  });
});

describe('chat participant registration id', () => {
  // The id passed to vscode.chat.createChatParticipant() MUST match a
  // contributes.chatParticipants[].id in package.json, or VS Code cannot bind the
  // runtime handler to its static declaration (name, slash commands,
  // disambiguation). This guards against the two drifting apart again.
  it('PARTICIPANT_ID matches a declared chatParticipants id in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
      contributes?: { chatParticipants?: Array<{ id?: string }> };
    };
    const declaredIds = (pkg.contributes?.chatParticipants ?? []).map((p) => p.id);
    expect(declaredIds).toContain(PARTICIPANT_ID);
  });
});
