// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { showError, showInfo, showWarning, withErrorHandling, XCSHApiError } from '../../utils/errors';

// Mock vscode
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn().mockResolvedValue(undefined),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
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
  commands: {
    executeCommand: jest.fn().mockResolvedValue(undefined),
  },
  l10n: {
    t: jest.fn((message: string, ...args: unknown[]) => {
      let result = message;
      for (let i = 0; i < args.length; i++) {
        result = result.replace(`{${i}}`, String(args[i]));
      }
      return result;
    }),
  },
}));

describe('XCSHApiError', () => {
  it('does not retain or echo upstream response content and request paths', () => {
    const privateMarker = 'PRIVATE_RESPONSE_CONTENT';
    const ErrorConstructor = XCSHApiError as unknown as new (
      statusCode: number,
      ...unexpected: unknown[]
    ) => XCSHApiError;
    const error = new ErrorConstructor(400, privateMarker, `/api/${privateMarker}`);

    expect(error.message).toBe('API request failed with status 400');
    expect(error.userFriendlyMessage).toBe('API request failed. Please try again.');
    expect('body' in error).toBe(false);
    expect('resourcePath' in error).toBe(false);
    expect(JSON.stringify(error)).not.toContain(privateMarker);
  });

  describe('constructor', () => {
    it('creates an error with only the status classification', () => {
      const error = new XCSHApiError(404);
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('XCSHApiError');
      expect(error.message).toBe('API request failed with status 404');
    });

    it('retains only an enumerated API-group classification', () => {
      const error = new XCSHApiError(404, 'api_group_not_found');
      expect(error.isApiGroupNotFound).toBe(true);
      expect(error.message).toBe('API request failed with status 404');
    });
  });

  describe('isAuthError', () => {
    it('should return true for 401', () => {
      const error = new XCSHApiError(401);
      expect(error.isAuthError).toBe(true);
    });

    it('should return true for 403', () => {
      const error = new XCSHApiError(403);
      expect(error.isAuthError).toBe(true);
    });

    it('should return false for other status codes', () => {
      const error = new XCSHApiError(404);
      expect(error.isAuthError).toBe(false);
    });
  });

  describe('isNotFound', () => {
    it('should return true for 404', () => {
      const error = new XCSHApiError(404);
      expect(error.isNotFound).toBe(true);
    });

    it('should return false for other status codes', () => {
      const error = new XCSHApiError(500);
      expect(error.isNotFound).toBe(false);
    });
  });

  describe('isRateLimited', () => {
    it('should return true for 429', () => {
      const error = new XCSHApiError(429);
      expect(error.isRateLimited).toBe(true);
    });

    it('should return false for other status codes', () => {
      const error = new XCSHApiError(400);
      expect(error.isRateLimited).toBe(false);
    });
  });

  describe('isConflict', () => {
    it('should return true for 409', () => {
      const error = new XCSHApiError(409);
      expect(error.isConflict).toBe(true);
    });

    it('should return false for other status codes', () => {
      const error = new XCSHApiError(400);
      expect(error.isConflict).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should return true for 500', () => {
      const error = new XCSHApiError(500);
      expect(error.isServerError).toBe(true);
    });

    it('should return true for 502', () => {
      const error = new XCSHApiError(502);
      expect(error.isServerError).toBe(true);
    });

    it('should return true for 503', () => {
      const error = new XCSHApiError(503);
      expect(error.isServerError).toBe(true);
    });

    it('should return false for client errors', () => {
      const error = new XCSHApiError(400);
      expect(error.isServerError).toBe(false);
    });
  });

  describe('isUnauthorized', () => {
    it('should return true for 401', () => {
      const error = new XCSHApiError(401);
      expect(error.isUnauthorized).toBe(true);
    });

    it('should return false for 403', () => {
      const error = new XCSHApiError(403);
      expect(error.isUnauthorized).toBe(false);
    });

    it('should return false for other status codes', () => {
      const error = new XCSHApiError(404);
      expect(error.isUnauthorized).toBe(false);
    });
  });

  describe('isForbidden', () => {
    it('should return true for 403', () => {
      const error = new XCSHApiError(403);
      expect(error.isForbidden).toBe(true);
    });

    it('should return false for 401', () => {
      const error = new XCSHApiError(401);
      expect(error.isForbidden).toBe(false);
    });

    it('should return false for other status codes', () => {
      const error = new XCSHApiError(404);
      expect(error.isForbidden).toBe(false);
    });
  });

  describe('userFriendlyMessage', () => {
    it('should return auth failed message for 401', () => {
      const error = new XCSHApiError(401);
      expect(error.userFriendlyMessage).toBe(
        'Authentication failed. Please check your credentials or re-authenticate.',
      );
    });

    it('should return permission denied message for 403', () => {
      const error = new XCSHApiError(403);
      expect(error.userFriendlyMessage).toBe('Permission denied. You do not have access to perform this operation.');
    });

    it('should return not found message for 404', () => {
      const error = new XCSHApiError(404);
      expect(error.userFriendlyMessage).toBe('Resource not found.');
    });

    it('should return rate limit message for 429', () => {
      const error = new XCSHApiError(429);
      expect(error.userFriendlyMessage).toBe('Rate limit exceeded. Please wait and try again.');
    });

    it('should return conflict message for 409', () => {
      const error = new XCSHApiError(409);
      expect(error.userFriendlyMessage).toBe('Resource conflict. The resource may have been modified.');
    });

    it('should return server error message for 500+', () => {
      const error = new XCSHApiError(500);
      expect(error.userFriendlyMessage).toBe('Server error. Please try again later.');
    });

    it('returns a generic message for other status codes', () => {
      const error = new XCSHApiError(400);
      expect(error.userFriendlyMessage).toBe('API request failed. Please try again.');
    });
  });
});

describe('withErrorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the result of successful operation', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const result = await withErrorHandling(operation, 'Test operation');
    expect(result).toBe('success');
  });

  it('should return undefined on XCSHApiError', async () => {
    const error = new XCSHApiError(500);
    const operation = jest.fn().mockRejectedValue(error);
    const result = await withErrorHandling(operation, 'Test operation');
    expect(result).toBeUndefined();
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('should show warning for rate limited errors', async () => {
    const error = new XCSHApiError(429);
    const operation = jest.fn().mockRejectedValue(error);
    await withErrorHandling(operation, 'Test operation');
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('should handle generic Error', async () => {
    const error = new Error('PRIVATE_RUNTIME_CONTENT');
    const operation = jest.fn().mockRejectedValue(error);
    const result = await withErrorHandling(operation, 'Test operation');
    expect(result).toBeUndefined();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Test operation: An unexpected error occurred');
  });

  it('should handle non-Error objects', async () => {
    const operation = jest.fn().mockRejectedValue('string error');
    const result = await withErrorHandling(operation, 'Test operation');
    expect(result).toBeUndefined();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Test operation: An unexpected error occurred');
  });
});

describe('showError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show error message without error object', () => {
    showError('Something went wrong');
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Something went wrong');
  });

  it('does not copy exception details into the notification', () => {
    const error = new Error('PRIVATE_RUNTIME_CONTENT');
    showError('Operation failed', error);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Operation failed');
  });
});

describe('showWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show warning message', () => {
    showWarning('This is a warning');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('This is a warning');
  });
});

describe('showInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show information message', () => {
    showInfo('This is info');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('This is info');
  });
});
