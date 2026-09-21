// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

const CONSUMER_ID_KEY = 'xcsh.herdr.consumerId';
const DISPLAY_KEY = 'xcsh.herdr.pane';
const LEASE_KEY_PREFIX = 'xcsh.herdr.lease.';
const MAX_OUTPUT_BYTES = 64 * 1024;
const ALLOWED_ENV = new Set([
  'HERDR_ENV',
  'HERDR_SOCKET_PATH',
  'HERDR_WORKSPACE_ID',
  'HERDR_TAB_ID',
  'HERDR_PANE_ID',
  'HERDR_BIN_PATH',
]);

interface PairingPayload {
  version: 1;
  endpoint: string;
  token: string;
}

interface LeaseRecord {
  version: 1;
  endpoint: string;
  lease: string;
}

interface ClaimResponse extends LeaseRecord {
  pane: PaneMetadata;
}

export interface PaneMetadata {
  workspace_id: string;
  tab_id: string;
  pane_id: string;
}

type HerdrRunner = (binary: string, args: readonly string[], stdin: string) => Promise<string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findHerdrBinary(): string | null {
  const inherited = process.env.HERDR_BIN_PATH;
  if (inherited && fs.existsSync(inherited)) {
    return inherited;
  }
  try {
    const resolved = execFileSync('which', ['herdr'], { encoding: 'utf8', timeout: 5000 }).trim();
    return resolved && fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

const runHerdr: HerdrRunner = (binary, args, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
      }
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr) > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0 && Buffer.byteLength(stdout) <= MAX_OUTPUT_BYTES) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || 'Herdr context command failed'));
      }
    });
    child.stdin?.end(stdin);
  });

export class HerdrBinding {
  private readonly consumerId: string;
  private warnedUnavailable = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runner: HerdrRunner = runHerdr,
    private readonly binaryLocator: () => string | null = findHerdrBinary,
  ) {
    const existing = context.workspaceState.get<string>(CONSUMER_ID_KEY);
    this.consumerId = existing || randomUUID();
    if (!existing) {
      void context.workspaceState.update(CONSUMER_ID_KEY, this.consumerId);
    }
  }

  async pair(payloadText: string): Promise<PaneMetadata> {
    const payload = this.parsePairingPayload(payloadText);
    const binary = this.requireBinary();
    const stdout = await this.runner(binary, ['context', 'claim', '--consumer-id', this.consumerId], payloadText);
    const claimed = this.parseClaimResponse(stdout, payload.endpoint);
    await this.context.secrets.store(
      this.secretKey(),
      JSON.stringify({
        version: 1,
        endpoint: claimed.endpoint,
        lease: claimed.lease,
      } satisfies LeaseRecord),
    );
    await this.context.workspaceState.update(DISPLAY_KEY, claimed.pane);
    this.warnedUnavailable = false;
    return claimed.pane;
  }

  async resolveEnvironment(): Promise<Record<string, string>> {
    const lease = await this.loadLease();
    if (!lease) {
      return {};
    }
    try {
      const stdout = await this.runner(
        this.requireBinary(),
        ['context', 'resolve', '--endpoint', lease.endpoint, '--consumer-id', this.consumerId],
        lease.lease,
      );
      const resolved = this.parseResolveResponse(stdout, lease.endpoint);
      await this.context.workspaceState.update(DISPLAY_KEY, resolved.pane);
      this.warnedUnavailable = false;
      return resolved.environment;
    } catch {
      await this.clear();
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        void vscode.window.showWarningMessage(
          'Herdr pairing is unavailable. Pair this window again to restore pane tracking.',
        );
      }
      return {};
    }
  }

  async disconnect(): Promise<void> {
    const lease = await this.loadLease();
    if (lease) {
      try {
        await this.runner(
          this.requireBinary(),
          ['context', 'revoke', '--endpoint', lease.endpoint, '--consumer-id', this.consumerId],
          lease.lease,
        );
      } catch {
        // Local cleanup is authoritative for an explicit disconnect.
      }
    }
    await this.clear();
    this.warnedUnavailable = false;
  }

  private async clear(): Promise<void> {
    await this.context.secrets.delete(this.secretKey());
    await this.context.workspaceState.update(DISPLAY_KEY, undefined);
  }

  private async loadLease(): Promise<LeaseRecord | undefined> {
    const stored = await this.context.secrets.get(this.secretKey());
    if (!stored) {
      return undefined;
    }
    try {
      const value: unknown = JSON.parse(stored);
      if (
        isRecord(value) &&
        value.version === 1 &&
        typeof value.endpoint === 'string' &&
        value.endpoint.length > 0 &&
        typeof value.lease === 'string' &&
        value.lease.length > 0
      ) {
        return value as unknown as LeaseRecord;
      }
    } catch {
      // Clear malformed secret storage below.
    }
    await this.clear();
    return undefined;
  }

  private parsePairingPayload(text: string): PairingPayload {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error('The Herdr pairing payload is not valid JSON.');
    }
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.endpoint !== 'string' ||
      value.endpoint.length === 0 ||
      typeof value.token !== 'string' ||
      value.token.length === 0
    ) {
      throw new Error('The Herdr pairing payload is incomplete or unsupported.');
    }
    return value as unknown as PairingPayload;
  }

  private parseClaimResponse(text: string, expectedEndpoint: string): ClaimResponse {
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      value.endpoint !== expectedEndpoint ||
      typeof value.lease !== 'string' ||
      !isPaneMetadata(value.pane)
    ) {
      throw new Error('Herdr returned an invalid lease.');
    }
    return value as unknown as ClaimResponse;
  }

  private parseResolveResponse(
    text: string,
    expectedEndpoint: string,
  ): {
    pane: PaneMetadata;
    environment: Record<string, string>;
  } {
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      !isRecord(value.capabilities) ||
      value.capabilities.worker_context_handoff !== 1 ||
      !isPaneMetadata(value.pane) ||
      !isRecord(value.environment)
    ) {
      throw new Error('Herdr returned unsupported worker context.');
    }
    const environment: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value.environment)) {
      if (!ALLOWED_ENV.has(key) || typeof raw !== 'string') {
        throw new Error('Herdr returned non-allowlisted worker context.');
      }
      environment[key] = raw;
    }
    if (
      environment.HERDR_ENV !== '1' ||
      environment.HERDR_SOCKET_PATH !== expectedEndpoint ||
      !environment.HERDR_WORKSPACE_ID ||
      !environment.HERDR_TAB_ID ||
      !environment.HERDR_PANE_ID ||
      !environment.HERDR_BIN_PATH
    ) {
      throw new Error('Herdr returned incomplete worker context.');
    }
    return { pane: value.pane, environment };
  }

  private requireBinary(): string {
    const binary = this.binaryLocator();
    if (!binary) {
      throw new Error('Herdr is not installed or HERDR_BIN_PATH is invalid.');
    }
    return binary;
  }

  private secretKey(): string {
    return `${LEASE_KEY_PREFIX}${this.consumerId}`;
  }
}

function isPaneMetadata(value: unknown): value is PaneMetadata {
  return (
    isRecord(value) &&
    typeof value.workspace_id === 'string' &&
    typeof value.tab_id === 'string' &&
    typeof value.pane_id === 'string'
  );
}
