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

  private readonly _onDidChangeStatus = new vscode.EventEmitter<ProcessStatus>();
  readonly onDidChangeStatus: vscode.Event<ProcessStatus> = this._onDidChangeStatus.event;

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

  /**
   * Start the xcsh process in RPC mode.
   * Resolves once the process is spawned (not necessarily ready).
   */
  start(): void {
    if (this.disposed) {
      return;
    }

    const userPath = vscode.workspace.getConfiguration('f5xc').get<string>('xcsh.path');
    const binary = findXcshBinary(userPath);

    if (!binary) {
      this.setStatus('not-installed');
      this.logger.warn('xcsh binary not found');
      return;
    }

    this.setStatus('starting');

    try {
      const child = spawn(binary, ['--mode', 'rpc'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.envVars },
        cwd: this.cwd,
      });

      child.on('error', (err) => {
        this.logger.error('xcsh process error', err);
        this.setStatus('error');
        this.scheduleRestart();
      });

      child.on('exit', (code) => {
        this.logger.info(`xcsh process exited with code ${String(code ?? 'null')}`);
        if (this.status !== 'stopped' && !this.disposed) {
          this.setStatus('error');
          this.scheduleRestart();
        }
      });

      this.process = child;
      this.retryCount = 0;
      this.setStatus('running');
      this.startHealthCheck();
    } catch (err) {
      this.logger.error('Failed to spawn xcsh', err instanceof Error ? err : new Error(String(err)));
      this.setStatus('error');
      this.scheduleRestart();
    }
  }

  /**
   * Stop the xcsh process gracefully via SIGTERM.
   */
  stop(): void {
    this.stopHealthCheck();

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.setStatus('stopped');
  }

  /**
   * Restart: stop then start.
   */
  restart(): void {
    this.stop();
    this.retryCount = 0;
    this.start();
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
      this.logger.warn('xcsh health check failed: process not running');
      this.setStatus('error');
      this.scheduleRestart();
    }
  }

  // ───────── auto-restart ─────────

  private scheduleRestart(): void {
    if (this.disposed || this.retryCount >= MAX_RETRIES) {
      this.logger.error(`xcsh auto-restart exhausted after ${String(this.retryCount)} retries`);
      return;
    }

    const delay = Math.min(1000 * 2 ** this.retryCount, MAX_BACKOFF_MS);
    this.retryCount++;
    this.logger.info(
      `Scheduling xcsh restart in ${String(delay)}ms (attempt ${String(this.retryCount)}/${String(MAX_RETRIES)})`,
    );

    setTimeout(() => {
      if (!this.disposed && this.status !== 'running') {
        this.start();
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
    this.stop();
    this._onDidChangeStatus.dispose();
  }
}
