// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getEnrichedErrorMessage } from '../api/resourceTypes';
import { getLogger } from './logger';

/**
 * Custom error class for F5 XC API errors
 */
export type ApiErrorClassification = 'api_group_not_found' | 'http_error';

export class XCSHApiError extends Error {
  public readonly statusCode: number;
  public readonly classification: ApiErrorClassification;

  constructor(statusCode: number, classification: ApiErrorClassification = 'http_error') {
    super(`API request failed with status ${statusCode}`);
    this.name = 'XCSHApiError';
    this.statusCode = statusCode;
    this.classification = classification === 'api_group_not_found' ? classification : 'http_error';
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isAuthError(): boolean {
    return this.isUnauthorized || this.isForbidden;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isApiGroupNotFound(): boolean {
    return this.statusCode === 404 && this.classification === 'api_group_not_found';
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  get isConflict(): boolean {
    return this.statusCode === 409;
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }

  get userFriendlyMessage(): string {
    if (this.isUnauthorized) {
      return vscode.l10n.t('Authentication failed. Please check your credentials or re-authenticate.');
    }
    if (this.isForbidden) {
      return vscode.l10n.t('Permission denied. You do not have access to perform this operation.');
    }
    if (this.isNotFound) {
      return vscode.l10n.t('Resource not found.');
    }
    if (this.isRateLimited) {
      return vscode.l10n.t('Rate limit exceeded. Please wait and try again.');
    }
    if (this.isConflict) {
      return vscode.l10n.t('Resource conflict. The resource may have been modified.');
    }
    if (this.isServerError) {
      return vscode.l10n.t('Server error. Please try again later.');
    }

    return vscode.l10n.t('API request failed. Please try again.');
  }
}

/**
 * Options for error handling with resource context
 */
export interface ErrorHandlingOptions {
  /** The resource type key (e.g., 'http_loadbalancer') for smart error messages */
  resourceTypeKey?: string;
  /** The operation being performed (for smart error messages) */
  operation?: 'list' | 'get' | 'create' | 'update' | 'delete';
}

/**
 * Wrapper for error handling with user notification
 * @param operation - The async operation to execute
 * @param context - Human-readable context for error messages
 * @param options - Optional error handling options for smart error messages
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options?: ErrorHandlingOptions,
): Promise<T | undefined> {
  const logger = getLogger();

  try {
    return await operation();
  } catch (error) {
    logger.error('ui.operation.failed');

    if (error instanceof XCSHApiError) {
      // Try to get a smart error message if we have resource context
      let smartMessage: string | undefined;
      if (options?.resourceTypeKey && options?.operation) {
        smartMessage = getEnrichedErrorMessage(options.resourceTypeKey, options.operation, error.statusCode);
      }

      if (error.isUnauthorized) {
        // 401 - Authentication failed, offer to configure profile or clear cache
        const message = smartMessage || error.userFriendlyMessage;
        const action = await vscode.window.showErrorMessage(
          vscode.l10n.t('{0}\n\nIf you recently updated credentials, try clearing the auth cache.', message),
          vscode.l10n.t('Configure Context'),
          vscode.l10n.t('Clear Auth Cache'),
        );
        if (action === vscode.l10n.t('Configure Context')) {
          await vscode.commands.executeCommand('xcsh.editContext');
        } else if (action === vscode.l10n.t('Clear Auth Cache')) {
          await vscode.commands.executeCommand('xcsh.clearAuthCache');
        }
      } else if (error.isForbidden) {
        // 403 - Permission denied, show smart message if available
        const message = smartMessage || error.userFriendlyMessage;
        void vscode.window.showErrorMessage(`${context}: ${message}`);
      } else if (error.isRateLimited) {
        const message = smartMessage || error.userFriendlyMessage;
        void vscode.window.showWarningMessage(message);
      } else if (error.isConflict) {
        // 409 - Conflict, use smart message for better guidance
        const message = smartMessage || error.userFriendlyMessage;
        void vscode.window.showErrorMessage(`${context}: ${message}`);
      } else {
        // For other errors, prefer smart message if available
        const message = smartMessage || error.userFriendlyMessage;
        void vscode.window.showErrorMessage(`${context}: ${message}`);
      }
    } else {
      void vscode.window.showErrorMessage(vscode.l10n.t('{0}: An unexpected error occurred', context));
    }

    return undefined;
  }
}

/**
 * Show error notification without throwing
 */
export function showError(message: string, error?: Error): void {
  const logger = getLogger();
  logger.error('ui.operation.failed');

  void error;
  void vscode.window.showErrorMessage(message);
}

/**
 * Show warning notification
 */
export function showWarning(message: string): void {
  void vscode.window.showWarningMessage(message);
}

/**
 * Show info notification
 */
export function showInfo(message: string): void {
  void vscode.window.showInformationMessage(message);
}
