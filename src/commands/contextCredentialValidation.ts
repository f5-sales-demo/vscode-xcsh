// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';

export type XcshAuthValidationFailure =
  | 'unauthorized'
  | 'forbidden'
  | 'redirect'
  | 'non_json'
  | 'rate_limited'
  | 'server'
  | 'timeout'
  | 'network';

export interface CredentialValidationResult {
  status: 'connected' | 'auth_error' | 'offline';
  failureReason?: XcshAuthValidationFailure;
  namespaces?: string[];
}

interface SharedAuthModule {
  normalizeXcshApiUrlInput(value: string): string | null;
  normalizeXcshCredentialInput(value: string, expectedKey: string): string | null;
  validateXcshApiCredentials(options: {
    apiUrl: string;
    apiToken: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }): Promise<CredentialValidationResult>;
}

const sharedAuth = require('@f5-sales-demo/pi-utils/xcsh-auth') as SharedAuthModule;

export const normalizeXcshApiUrlInput = (value: string): string | null => sharedAuth.normalizeXcshApiUrlInput(value);

export const normalizeXcshCredentialInput = (value: string, expectedKey: string): string | null =>
  sharedAuth.normalizeXcshCredentialInput(value, expectedKey);

export const validateXcshApiCredentials = (options: {
  apiUrl: string;
  apiToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<CredentialValidationResult> => sharedAuth.validateXcshApiCredentials(options);

export function credentialValidationFailureMessage(reason: XcshAuthValidationFailure | undefined): string {
  switch (reason) {
    case 'unauthorized':
      return vscode.l10n.t('Authentication failed — the API token was rejected.');
    case 'forbidden':
      return vscode.l10n.t('The token does not have permission to list namespaces.');
    case 'redirect':
    case 'non_json':
      return vscode.l10n.t('The tenant URL did not return the XC namespaces API.');
    case 'rate_limited':
      return vscode.l10n.t('Validation was rate-limited. Wait briefly, then try again.');
    case 'server':
      return vscode.l10n.t('The tenant server could not validate credentials. Try again shortly.');
    case 'timeout':
      return vscode.l10n.t('Validation timed out. Check network access and the tenant URL.');
    default:
      return vscode.l10n.t('Could not reach the API. Check the URL and network, then try again.');
  }
}

export async function validateCredentialsWithProgress(
  apiUrl: string,
  apiToken: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  title: string = vscode.l10n.t('Verifying connection...'),
): Promise<CredentialValidationResult> {
  return await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: false },
    () => validateXcshApiCredentials({ apiUrl, apiToken, fetch: fetchImpl, timeoutMs: 5000 }),
  );
}
