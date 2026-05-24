// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type {
  IntegrationsResponse,
  MessageUpdate,
  ModelInfo,
  RpcCommand,
  RpcEvent,
  RpcResponse,
  RpcSessionState,
} from './types';

const COMMAND_TIMEOUT_MS = 30_000;

type EventHandler<T extends RpcEvent = RpcEvent> = (event: T) => void;

interface PendingCommand {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * JSONL protocol bridge for xcsh RPC communication.
 *
 * Commands are written to stdin as JSON followed by newline.
 * Responses and events are read from stdout line by line.
 * Responses have `type: 'response'` and correlate by `id`.
 * All other JSON objects are events dispatched to registered handlers.
 */
export class XcshRpcBridge implements vscode.Disposable {
  private readonly logger = getLogger();
  private stdin: Writable;
  private stdout: Readable;
  private rl: readline.Interface | null = null;

  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly eventListeners = new Map<string, Set<EventHandler>>();

  constructor(stdin: Writable, stdout: Readable) {
    this.stdin = stdin;
    this.stdout = stdout;
  }

  /**
   * Initialize the readline interface for parsing JSONL from stdout.
   */
  init(): void {
    if (this.rl) {
      return;
    }

    this.rl = readline.createInterface({
      input: this.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    this.rl.on('line', (line) => {
      this.handleLine(line);
    });

    this.rl.on('close', () => {
      // Reject all pending commands on stream close
      for (const [id, pending] of this.pendingCommands) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Stream closed'));
        this.pendingCommands.delete(id);
      }
    });
  }

  /**
   * Send a command and wait for the correlated response.
   */
  async sendCommand(cmd: RpcCommand): Promise<RpcResponse> {
    const id = cmd.id ?? crypto.randomUUID();
    const toSend: RpcCommand = { ...cmd, id };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command ${cmd.type} timed out`));
      }, COMMAND_TIMEOUT_MS);

      this.pendingCommands.set(id, { resolve, reject, timer });

      const line = `${JSON.stringify(toSend)}\n`;
      this.stdin.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingCommands.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Fire-and-forget: send a prompt to xcsh.
   */
  prompt(text: string, options?: Record<string, unknown>): void {
    const cmd: RpcCommand = { type: 'prompt', message: text, ...options };
    this.stdin.write(`${JSON.stringify(cmd)}\n`);
  }

  /**
   * Send an abort command to cancel current operation.
   */
  abort(): void {
    const cmd: RpcCommand = { type: 'abort' };
    this.stdin.write(`${JSON.stringify(cmd)}\n`);
  }

  // ───────── convenience methods ─────────

  async getState(): Promise<RpcSessionState> {
    const response = await this.sendCommand({ type: 'get_state' });
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to get state');
    }
    return response.data as RpcSessionState;
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    const response = await this.sendCommand({ type: 'set_model', provider, modelId });
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to set model');
    }
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    const response = await this.sendCommand({ type: 'get_available_models' });
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to get available models');
    }
    return (response.data as { models: ModelInfo[] }).models;
  }

  async getIntegrations(): Promise<IntegrationsResponse> {
    const response = await this.sendCommand({ type: 'get_integrations' });
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to get integrations');
    }
    return response.data as IntegrationsResponse;
  }

  // ───────── event handling ─────────

  /**
   * Register an event listener. Returns a Disposable to unregister.
   */
  onEvent<T extends RpcEvent>(type: string, handler: EventHandler<T>): vscode.Disposable {
    let handlers = this.eventListeners.get(type);
    if (!handlers) {
      handlers = new Set();
      this.eventListeners.set(type, handlers);
    }
    handlers.add(handler as EventHandler);

    return new vscode.Disposable(() => {
      handlers?.delete(handler as EventHandler);
    });
  }

  /**
   * Convenience: listen for assistant text deltas from message_update events.
   *
   * xcsh message_update events have nested structure:
   *   { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "chunk" } }
   * This method extracts the text delta and dispatches a simplified { text } object.
   */
  onMessageStream(handler: (event: MessageUpdate) => void): vscode.Disposable {
    return this.onEvent('message_update', (raw) => {
      const assistantEvent = (raw as Record<string, unknown>).assistantMessageEvent as
        | { type: string; delta?: string }
        | undefined;
      if (assistantEvent?.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
        handler({ type: 'message_update', text: assistantEvent.delta });
      }
    });
  }

  // ───────── internal line processing ─────────

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      this.logger.debug(`Ignoring non-JSON line: ${trimmed.slice(0, 100)}`);
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }

    const obj = parsed as Record<string, unknown>;

    // Check if this is a response to a pending command
    if (obj.type === 'response' && typeof obj.id === 'string') {
      const pending = this.pendingCommands.get(obj.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(obj.id);
        pending.resolve(obj as unknown as RpcResponse);
        return;
      }
    }

    // Otherwise, treat as an event
    const eventType = obj.type as string | undefined;
    if (eventType) {
      this.dispatchEvent(eventType, obj as RpcEvent);
    }
  }

  private dispatchEvent(type: string, event: RpcEvent): void {
    const handlers = this.eventListeners.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          this.logger.error('Event handler error', err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  // ───────── reconnection ─────────

  reconnect(newStdin: Writable, newStdout: Readable): void {
    for (const [, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge reconnecting'));
    }
    this.pendingCommands.clear();
    this.rl?.close();
    this.rl = null;

    this.stdin = newStdin;
    this.stdout = newStdout;
    this.init();
  }

  // ───────── disposal ─────────

  dispose(): void {
    for (const [, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
    }
    this.pendingCommands.clear();
    this.eventListeners.clear();
    this.rl?.close();
  }
}
