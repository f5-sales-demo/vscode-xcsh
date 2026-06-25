// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { RpcToolCall, RpcToolResult } from '../../xcsh/types';

describe('RPC tool call types', () => {
  it('RpcToolCall has correct shape', () => {
    const call: RpcToolCall = {
      type: 'tool_call',
      toolCallId: 'tc-1',
      toolName: 'vscode_read_file',
      arguments: { path: '/test.ts' },
    };
    expect(call.type).toBe('tool_call');
    expect(call.toolCallId).toBe('tc-1');
    expect(call.toolName).toBe('vscode_read_file');
    expect(call.arguments).toEqual({ path: '/test.ts' });
  });

  it('RpcToolResult has correct shape', () => {
    const result: RpcToolResult = {
      type: 'tool_result',
      toolCallId: 'tc-1',
      result: 'file contents here',
    };
    expect(result.type).toBe('tool_result');
    expect(result.toolCallId).toBe('tc-1');
    expect(result.result).toBe('file contents here');
  });

  it('RpcToolResult supports isError flag', () => {
    const result: RpcToolResult = {
      type: 'tool_result',
      toolCallId: 'tc-2',
      result: 'File not found',
      isError: true,
    };
    expect(result.isError).toBe(true);
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Agent Skills validation', () => {
  const skillsDir = path.resolve(__dirname, '../../../skills');
  const expectedSkills = ['xcsh-resource-management', 'xcsh-troubleshooting', 'xcsh-configuration-authoring'];

  for (const skillName of expectedSkills) {
    it(`${skillName}/SKILL.md exists and has valid frontmatter`, () => {
      const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, 'utf-8');

      expect(content.startsWith('---')).toBe(true);
      const endOfFrontmatter = content.indexOf('---', 3);
      expect(endOfFrontmatter).toBeGreaterThan(3);

      const frontmatter = content.slice(3, endOfFrontmatter);
      expect(frontmatter).toContain('name:');
      expect(frontmatter).toContain('description:');

      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      expect(nameMatch).not.toBeNull();
      expect(nameMatch?.[1]?.trim()).toBe(skillName);
    });
  }

  it('resource-management has example files', () => {
    const examplesDir = path.join(skillsDir, 'xcsh-resource-management', 'examples');
    expect(fs.existsSync(path.join(examplesDir, 'http-load-balancer.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(examplesDir, 'origin-pool.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(examplesDir, 'health-check.yaml'))).toBe(true);
  });
});
