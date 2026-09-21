// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type { ProcessStatus } from './types';

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30_000;
const STOP_TIMEOUT_MS = 2_000;

export type WorkerEnvironmentResolver = () => Promise<Record<string, string>>;

/**
 * Locate the xcsh binary using a prioritized search order:
 *
 * 1. User-configured path (pass as argument)
 * 2. System PATH via `which xcsh`
 * 3. Homebrew locations
 * 4. npm global bin
 *
 * Uses `execFileSync` (no shell) for safe binary detection.
 */
export function findXcshBinary(userConfiguredPath?: string): string | null {
  // 1. User-configured path
  if (userConfiguredPath) {
    if (fs.existsSync(userConfiguredPath)) {
      return userConfiguredPath;
    }
    return null;
  }

  // 2. which xcsh
  try {
    const result = execFileSync('which', ['xcsh'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const resolved = result.trim();
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  } catch {
    // Not on PATH
  }

  // 3. Homebrew locations
  const brewPaths = ['/opt/homebrew/bin/xcsh', '/usr/local/bin/xcsh'];
  for (const bp of brewPaths) {
    if (fs.existsSync(bp)) {
      return bp;
    }
  }

  // 4. npm global
  try {
    const npmRoot = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const npmBin = path.join(npmRoot, '.bin', 'xcsh');
    if (fs.existsSync(npmBin)) {
      return npmBin;
    }
  } catch {
    // npm not available
  }

  return null;
}

/**
 * Manages the xcsh child process lifecycle: spawn, stop, restart,
 * health-check, and auto-restart with exponential backoff.
 */
export class XcshProcessManager implements vscode.Disposable {
  private readonly logger = getLogger();
  private process: ChildProcess | null = null;
  private status: ProcessStatus = 'stopped';
  private envVars: Record<string, string> = {};
  private cwd: string | undefined;
  private retryCount = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private lifecycle: Promise<void> = Promise.resolve();
  private environmentResolver: WorkerEnvironmentResolver = () => Promise.resolve({});

  private readonly _onDidChangeStatus = new vscode.EventEmitter<ProcessStatus>();
  readonly onDidChangeStatus: vscode.Event<ProcessStatus> = this._onDidChangeStatus.event;
  private readonly _onDidSpawn = new vscode.EventEmitter<ChildProcess>();
  readonly onDidSpawn: vscode.Event<ChildProcess> = this._onDidSpawn.event;

  getStatus(): ProcessStatus {
    return this.status;
  }

  getProcess(): ChildProcess | null {
    return this.process;
  }

  setEnvVars(env: Record<string, string>): void {
    this.envVars = { ...env };
  }

  setCwd(cwd: string | undefined): void {
    this.cwd = cwd;
  }

  setEnvironmentResolver(resolver: WorkerEnvironmentResolver): void {
    this.environmentResolver = resolver;
  }

  /**
   * Start the xcsh process in RPC mode.
   * Resolves once the process is spawned (not necessarily ready).
   */
  start(): Promise<void> {
    return this.enqueue(() => this.startNow());
  }

  private async startNow(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.process?.exitCode === null) {
      return;
    }

    const userPath = vscode.workspace.getConfiguration('xcsh').get<string>('xcsh.path');
    const binary = findXcshBinary(userPath);

    if (!binary) {
      this.setStatus('not-installed');
      this.logger.warn('process.binary.missing');
      return;
    }

    this.setStatus('starting');

    try {
      const inherited = { ...process.env };
      for (const key of Object.keys(inherited)) {
        if (key.startsWith('HERDR_')) {
          delete inherited[key];
        }
      }
      const resolvedEnvironment = await this.environmentResolver();
      const child = spawn(binary, ['--mode', 'rpc'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...inherited,
          ...this.envVars,
          ...resolvedEnvironment,
          XCSH_LOCALE: vscode.env.language,
        },
        cwd: this.cwd,
      });

      child.on('error', () => {
        if (this.process !== child) {
          return;
        }
        this.process = null;
        this.logger.error('process.spawn.failed');
        this.setStatus('error');
        this.scheduleRestart();
      });

      child.on('exit', () => {
        if (this.process !== child) {
          return;
        }
        this.process = null;
        this.logger.info('process.exited');
        if (this.status !== 'stopped' && !this.disposed) {
          this.setStatus('error');
          this.scheduleRestart();
        }
      });

      this.process = child;
      this.retryCount = 0;
      this.setStatus('running');
      this.startHealthCheck();
      this._onDidSpawn.fire(child);
    } catch {
      this.logger.error('process.spawn.failed');
      this.setStatus('error');
      this.scheduleRestart();
    }
  }

  /**
   * Stop the xcsh process gracefully via SIGTERM.
   */
  stop(): Promise<void> {
    return this.enqueue(() => this.stopNow());
  }

  private async stopNow(): Promise<void> {
    this.stopHealthCheck();

    const child = this.process;
    this.process = null;
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      if (child.pid !== undefined) {
        await waitForExit(child, STOP_TIMEOUT_MS);
        if (child.exitCode === null) {
          child.kill('SIGKILL');
          await waitForExit(child, STOP_TIMEOUT_MS);
        }
        if (child.exitCode === null) {
          throw new Error('xcsh worker did not exit; replacement was not started');
        }
      }
    }

    this.setStatus('stopped');
  }

  /**
   * Restart: stop then start.
   */
  restart(): Promise<void> {
    return this.enqueue(async () => {
      await this.stopNow();
      this.retryCount = 0;
      await this.startNow();
    });
  }

  // ───────── health check ─────────

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthTimer = setInterval(() => {
      this.checkHealth();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private checkHealth(): void {
    if (!this.process || this.process.exitCode !== null) {
      this.logger.warn('process.health.failed');
      this.setStatus('error');
      this.scheduleRestart();
    }
  }

  // ───────── auto-restart ─────────

  private scheduleRestart(): void {
    if (this.disposed || this.retryCount >= MAX_RETRIES) {
      this.logger.error('process.restart.exhausted');
      return;
    }

    const delay = Math.min(1000 * 2 ** this.retryCount, MAX_BACKOFF_MS);
    this.retryCount++;
    this.logger.info('process.restart.scheduled');

    setTimeout(() => {
      if (!this.disposed && this.status !== 'running') {
        void this.start();
      }
    }, delay);
  }

  // ───────── status ─────────

  private setStatus(status: ProcessStatus): void {
    if (this.status !== status) {
      this.status = status;
      this._onDidChangeStatus.fire(status);
    }
  }

  // ───────── disposal ─────────

  dispose(): void {
    this.disposed = true;
    void this.stop();
    this._onDidChangeStatus.dispose();
    this._onDidSpawn.dispose();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.catch(() => {});
    return next;
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
