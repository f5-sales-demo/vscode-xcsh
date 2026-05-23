// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * RPC protocol type definitions for xcsh communication.
 *
 * These types define the JSONL-based protocol used between the VS Code
 * extension and the xcsh process running in `--mode rpc`.
 */

// ───────── Process & Session ─────────

export type ProcessStatus = 'starting' | 'running' | 'stopped' | 'error' | 'not-installed';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface ModelInfo {
  provider: string;
  modelId: string;
  name?: string;
}

export interface RpcSessionState {
  model?: ModelInfo;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  sessionId: string;
  sessionName?: string;
  messageCount: number;
}

// ───────── Commands & Responses ─────────

export interface RpcCommand {
  id?: string;
  type: string;
  [key: string]: unknown;
}

export interface RpcResponse {
  id?: string;
  type: 'response';
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ───────── Events ─────────

export interface RpcEvent {
  type: string;
  [key: string]: unknown;
}

export interface MessageUpdate extends RpcEvent {
  type: 'message_update';
  text: string;
}

export interface ToolExecutionStart extends RpcEvent {
  type: 'tool_execution_start';
  toolName: string;
  toolCallId: string;
}

export interface ToolExecutionEnd extends RpcEvent {
  type: 'tool_execution_end';
  toolCallId: string;
  result?: unknown;
}

// ───────── Host Tools ─────────

export interface RpcHostToolDefinition {
  name: string;
  label?: string;
  description: string;
  parameters: Record<string, unknown>;
  hidden?: boolean;
}

export interface RpcHostToolCall {
  type: 'host_tool_call';
  id: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface RpcHostToolResult {
  type: 'host_tool_result';
  id: string;
  result: { data: unknown };
  isError?: boolean;
}

export interface RpcHostToolCancel {
  type: 'host_tool_cancel';
  id: string;
  targetId: string;
}

// ───────── Extension UI ─────────

export interface ExtensionUIRequest {
  type: 'extension_ui_request';
  id: string;
  method: string;
  [key: string]: unknown;
}

export interface ExtensionUIResponse {
  type: 'extension_ui_response';
  id: string;
  value?: unknown;
  confirmed?: boolean;
  cancelled?: boolean;
}
