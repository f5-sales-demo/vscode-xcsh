// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * RPC protocol type definitions for xcsh communication.
 *
 * These types define the JSONL-based protocol used between the VS Code
 * extension and the xcsh process running in `--mode rpc`.
 */

// ───────── Process & Session ─────────

export type ProcessStatus = 'starting' | 'running' | 'stopped' | 'error' | 'not-installed';

type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

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

// ───────── Integration Health ─────────

type ServiceState = 'connected' | 'unauthenticated' | 'unavailable';

interface ServiceStatus {
  name: string;
  state: ServiceState;
  hint?: string;
}

export interface IntegrationsResponse {
  version: string;
  model: { state: string; provider?: string; latencyMs?: number };
  services: ServiceStatus[];
}

// ───────── Events ─────────

export interface RpcEvent {
  type: string;
  [key: string]: unknown;
}

/** One skill the engine has loaded, as the composer's Skills submenu shows it. */
export interface SkillInfo {
  name: string;
  description: string;
}

/** A source an answer cited, for the transcript's Sources chips. Field-for-field with
 *  the shared chat-ui `ChatReference` the vendored ReferenceChips renders. */
interface ChatReferenceWire {
  kind: 'doc' | 'console';
  title: string;
  url: string;
}

/** xcsh -> host: the citations for a SETTLED assistant turn (xcsh #2420). Emitted on
 *  the RPC stream rather than derived here: picking the terminal message out of the
 *  event stream and scraping citations from its blocks is the engine's job, and
 *  reimplementing it would drift from the one shared extractor. */
export interface ReferencesEvent extends RpcEvent {
  references: ChatReferenceWire[];
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

// ───────── Tool Calling (LM Provider) ─────────

export interface RpcToolCall extends RpcEvent {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface RpcToolResult {
  type: 'tool_result';
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}
