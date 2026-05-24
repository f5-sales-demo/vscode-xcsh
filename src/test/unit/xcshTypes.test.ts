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
