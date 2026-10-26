// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../config/contextTypes';
import { NativeContextHost } from './nativeContextHost';

export type NativeF5Action =
  | 'discover'
  | 'describe'
  | 'validate'
  | 'inspect'
  | 'apply'
  | 'create'
  | 'update'
  | 'delete';
export interface NativeF5Input {
  action: NativeF5Action;
  kind?: string;
  name?: string;
  field?: string;
  objects?: Record<string, unknown>[];
}

/** Structural package boundary until the accepted shared release is pinned. */
export interface NativeF5Core {
  bind(invocation: string): Promise<{ readonly id: string }>;
  discover(binding: { readonly id: string }, signal?: AbortSignal): Promise<unknown>;
  describe(
    binding: { readonly id: string },
    kind: string,
    options: { field?: string },
    signal?: AbortSignal,
  ): Promise<unknown>;
  validate(
    binding: { readonly id: string },
    objects: Record<string, unknown>[],
    operation: 'create',
    signal?: AbortSignal,
  ): Promise<unknown>;
  inspect(binding: { readonly id: string }, kind: string, name?: string, signal?: AbortSignal): Promise<unknown>;
  plan(
    binding: { readonly id: string },
    operation: 'apply' | 'create' | 'update' | 'delete',
    objects: Record<string, unknown>[],
    signal?: AbortSignal,
  ): Promise<{ readonly id: string }>;
  execute(binding: { readonly id: string }, planId: string, signal?: AbortSignal): Promise<unknown>;
  dispose(): void;
}
export type NativeF5CoreFactory = (host: NativeContextHost) => NativeF5Core;

const actions = new Set<NativeF5Action>([
  'discover',
  'describe',
  'validate',
  'inspect',
  'apply',
  'create',
  'update',
  'delete',
]);
const writes = new Set<NativeF5Action>(['apply', 'create', 'update', 'delete']);

/**
 * One context host and core per invocation prevents concurrent chat requests from
 * refreshing each other's bindings. No plan handle or private reference crosses
 * invocations. The native request token is opaque; never read its internal fields.
 */
export class NativeF5Tool implements vscode.LanguageModelTool<NativeF5Input>, vscode.Disposable {
  private readonly active = new Set<AbortController>();
  private disposed = false;

  constructor(
    private readonly manager: ContextManagerInterface,
    private readonly workspaceRoot: () => string | undefined,
    private readonly storagePath: string,
    private readonly createCore: NativeF5CoreFactory,
  ) {}

  dispose(): void {
    this.disposed = true;
    for (const controller of this.active) {
      controller.abort();
    }
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<NativeF5Input>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (this.disposed || token.isCancellationRequested) {
      throw new Error('CANCELED');
    }
    const input = structuredClone(options.input);
    if (!input || !actions.has(input.action)) {
      throw new Error('INVALID_OPERATION');
    }
    if (
      writes.has(input.action) &&
      (options.toolInvocationToken === undefined || options.toolInvocationToken === null)
    ) {
      throw new Error('NATIVE_REQUEST_REQUIRED');
    }
    if (['describe', 'inspect'].includes(input.action) && (!input.kind || typeof input.kind !== 'string')) {
      throw new Error('INVALID_OPERATION');
    }
    if (['validate', ...writes].includes(input.action) && (!Array.isArray(input.objects) || !input.objects.length)) {
      throw new Error('INVALID_MANIFEST');
    }
    const controller = new AbortController();
    this.active.add(controller);
    const cancellation = token.onCancellationRequested(() => controller.abort());
    // Subscribe before checking again, covering cancellation during registration.
    if (token.isCancellationRequested) {
      controller.abort();
    }
    let host: NativeContextHost | undefined;
    let core: NativeF5Core | undefined;
    try {
      host = new NativeContextHost(this.manager, this.workspaceRoot, this.storagePath);
      await host.prepareContext(controller.signal);
      core = this.createCore(host);
      // Generate the identity inside this trusted native invocation. Neither the
      // model nor a prior conversation can supply a binding or an approval handle.
      const binding = await core.bind(randomUUID());
      let result: unknown;
      switch (input.action) {
        case 'discover':
          result = await core.discover(binding, controller.signal);
          break;
        case 'describe':
          result = await core.describe(binding, input.kind ?? '', { field: input.field }, controller.signal);
          break;
        case 'inspect':
          result = await core.inspect(binding, input.kind ?? '', input.name, controller.signal);
          break;
        case 'validate':
          result = await core.validate(binding, input.objects ?? [], 'create', controller.signal);
          break;
        default: {
          const plan = await core.plan(binding, input.action, input.objects ?? [], controller.signal);
          // execute owns exact native approval and the final context/state checks.
          // Never retry a mutation or carry this plan into another tool invocation.
          result = await core.execute(binding, plan.id, controller.signal);
        }
      }
      // A successful mutation result is independently verified by the core. Late
      // cancellation must not relabel a completed write as an undispatched one.
      if (controller.signal.aborted && !writes.has(input.action)) {
        throw new Error('CANCELED');
      }
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result))]);
    } catch (error) {
      // Only contract codes are public. A transport or credential error's raw
      // message and cause may contain private values and must not reach the model.
      const code =
        error instanceof Error && /^[A-Z][A-Z_]{2,63}$/.test(error.message) ? error.message : 'F5_OPERATION_FAILED';
      throw new Error(code, { cause: error });
    } finally {
      cancellation.dispose();
      core?.dispose();
      host?.dispose();
      this.active.delete(controller);
    }
  }
}

/** Called only by an accepted native route with its pinned bundled core. */
export function registerNativeF5Tool(context: vscode.ExtensionContext, tool: NativeF5Tool): boolean {
  void vscode.commands.executeCommand('setContext', 'xcsh.nativeF5Ready', false);
  if (vscode.env.appName === 'Kiro' || typeof vscode.lm?.registerTool !== 'function') {
    tool.dispose();
    return false;
  }
  try {
    const registration = vscode.lm.registerTool('xcsh-f5', tool);
    context.subscriptions.push(
      tool,
      registration,
      new vscode.Disposable(() => {
        void vscode.commands.executeCommand('setContext', 'xcsh.nativeF5Ready', false);
      }),
    );
    void vscode.commands.executeCommand('setContext', 'xcsh.nativeF5Ready', true);
    return true;
  } catch {
    tool.dispose();
    return false;
  }
}
