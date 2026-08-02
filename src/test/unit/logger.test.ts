// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getLogger, Logger } from '../../utils/logger';

// Mock vscode module
jest.mock('vscode', () => ({
  window: {
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
    })),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn().mockReturnValue('info'),
    })),
  },
}));

describe('Logger', () => {
  let logger: Logger;
  let mockOutputChannel: { appendLine: jest.Mock; show: jest.Mock; dispose: jest.Mock };

  beforeEach(() => {
    mockOutputChannel = {
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
    };
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
    logger = new Logger('Test Logger');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create output channel with name', () => {
      expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Test Logger');
    });
  });

  describe('debug', () => {
    it('should not log when log level is info', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('info'),
      });

      logger.debug('api.request.started');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });

    it('should log when log level is debug', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('debug'),
      });

      logger.debug('api.request.started');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('ignores unexpected arguments at runtime', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('debug'),
      });

      const unsafeLogger = logger as unknown as {
        debug(event: string, ...unexpected: unknown[]): void;
      };
      unsafeLogger.debug('api.request.started', { key: 'value' });
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });
  });

  describe('info', () => {
    it('should log when log level is info', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('info'),
      });

      logger.info('extension.activation.started');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should not log when log level is warn', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('warn'),
      });

      logger.info('extension.activation.started');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });

    it('ignores unexpected arguments at runtime', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('info'),
      });

      const unsafeLogger = logger as unknown as {
        info(event: string, ...unexpected: unknown[]): void;
      };
      unsafeLogger.info('extension.activation.started', { data: 'test' });
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });
  });

  describe('warn', () => {
    it('should log when log level is warn', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('warn'),
      });

      logger.warn('process.binary.missing');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should log when log level is info', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('info'),
      });

      logger.warn('process.binary.missing');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should not log when log level is error', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('error'),
      });

      logger.warn('process.binary.missing');
      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('error'),
      });

      logger.error('ui.operation.failed');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should always log errors regardless of level', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('error'),
      });

      logger.error('ui.operation.failed');
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('ignores an unexpected Error object at runtime', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('error'),
      });

      const error = new Error('PRIVATE_RUNTIME_CONTENT');
      const unsafeLogger = logger as unknown as {
        error(event: string, ...unexpected: unknown[]): void;
      };
      unsafeLogger.error('ui.operation.failed', error);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });

    it('does not log an unexpected error stack at runtime', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('error'),
      });

      const error = new Error('PRIVATE_RUNTIME_CONTENT');
      error.stack = 'PRIVATE_RUNTIME_STACK';
      const unsafeLogger = logger as unknown as {
        error(event: string, ...unexpected: unknown[]): void;
      };
      unsafeLogger.error('ui.operation.failed', error);
      const written = mockOutputChannel.appendLine.mock.calls.flat().join('\n');
      expect(written).not.toContain('PRIVATE_RUNTIME_STACK');
    });

    it('does not log unexpected structured arguments at runtime', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('error'),
      });

      const unsafeLogger = logger as unknown as {
        error(event: string, ...unexpected: unknown[]): void;
      };
      unsafeLogger.error('ui.operation.failed', undefined, { context: 'PRIVATE_RUNTIME_CONTENT' });
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });

    it('does not record raw exceptions, stacks, or structured values', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue('error'),
      });

      const privateMarker = 'PRIVATE_RUNTIME_CONTENT';
      const error = new Error(privateMarker);
      error.stack = `stack:${privateMarker}`;

      const unsafeLogger = logger as unknown as {
        error(event: string, ...unexpected: unknown[]): void;
      };
      unsafeLogger.error('ui.operation.failed', error, { detail: privateMarker });

      const written = mockOutputChannel.appendLine.mock.calls.flat().join('\n');
      expect(written).toContain('ui.operation.failed');
      expect(written).not.toContain(privateMarker);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });
  });

  describe('show', () => {
    it('should call show on output channel', () => {
      logger.show();
      expect(mockOutputChannel.show).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should call dispose on output channel', () => {
      logger.dispose();
      expect(mockOutputChannel.dispose).toHaveBeenCalled();
    });
  });
});

describe('getLogger', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should return a logger instance', () => {
    const logger = getLogger();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('should return the same instance on subsequent calls', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();
    expect(logger1).toBe(logger2);
  });
});
