// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Fixed operational events are the only values accepted by the logger. Logs are
 * diagnostic metadata, not a second copy of user, customer, request, response,
 * filesystem, or credential data.
 */
export type LogEvent =
  | 'api.access-check.failed'
  | 'api.request.completed'
  | 'api.request.failed'
  | 'api.request.started'
  | 'api.request.unauthorized'
  | 'auth.validation.failed'
  | 'auth.validation.started'
  | 'auth.validation.succeeded'
  | 'auth.validation.timed-out'
  | 'chat.event.received'
  | 'chat.registered'
  | 'chat.request.completed'
  | 'chat.request.failed'
  | 'chat.request.started'
  | 'chat.request.timed-out'
  | 'context.changed'
  | 'context.read.failed'
  | 'context.secret.missing'
  | 'context.temp.cleanup.failed'
  | 'extension.activation.completed'
  | 'extension.activation.failed'
  | 'extension.activation.started'
  | 'extension.cache.ready'
  | 'extension.explorer.refreshed'
  | 'extension.provider.registered'
  | 'geocoder.request.completed'
  | 'geocoder.request.empty'
  | 'geocoder.request.failed'
  | 'host-tool.failed'
  | 'integration.activation.completed'
  | 'integration.activation.disabled'
  | 'integration.activation.failed'
  | 'integration.activation.started'
  | 'integration.context.unavailable'
  | 'integration.locale.failed'
  | 'integration.process.unavailable'
  | 'process.binary.missing'
  | 'process.exited'
  | 'process.health.failed'
  | 'process.restart.exhausted'
  | 'process.restart.scheduled'
  | 'process.spawn.failed'
  | 'resource.operation.completed'
  | 'resource.operation.failed'
  | 'resource.operation.started'
  | 'rpc.handler.failed'
  | 'rpc.message.invalid'
  | 'schema.cache.cleared'
  | 'schema.generated'
  | 'schema.generation.failed'
  | 'schema.registered'
  | 'schema.unavailable'
  | 'subscription.operation.completed'
  | 'subscription.operation.failed'
  | 'subscription.operation.started'
  | 'ui.operation.failed'
  | 'webview.attachment.failed'
  | 'webview.bundle.failed'
  | 'webview.locale.failed'
  | 'webview.resolved';

export class Logger {
  private outputChannel: vscode.OutputChannel;

  constructor(name: string) {
    this.outputChannel = vscode.window.createOutputChannel(name);
  }

  private getConfiguredLogLevel(): LogLevel {
    const config = vscode.workspace.getConfiguration('xcsh');
    return config.get<LogLevel>('logLevel', 'info');
  }

  private shouldLog(level: LogLevel): boolean {
    const configuredLevel = this.getConfiguredLogLevel();
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(configuredLevel);
  }

  private formatMessage(level: LogLevel, event: LogEvent): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${event}`;
  }

  debug(event: LogEvent): void {
    if (this.shouldLog('debug')) {
      this.outputChannel.appendLine(this.formatMessage('debug', event));
    }
  }

  info(event: LogEvent): void {
    if (this.shouldLog('info')) {
      this.outputChannel.appendLine(this.formatMessage('info', event));
    }
  }

  warn(event: LogEvent): void {
    if (this.shouldLog('warn')) {
      this.outputChannel.appendLine(this.formatMessage('warn', event));
    }
  }

  error(event: LogEvent): void {
    if (this.shouldLog('error')) {
      this.outputChannel.appendLine(this.formatMessage('error', event));
    }
  }

  show(): void {
    this.outputChannel.show();
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

// Singleton logger instance
let defaultLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('xcsh');
  }
  return defaultLogger;
}
