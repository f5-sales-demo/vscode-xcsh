// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type * as https from 'node:https';

export interface AuthProvider {
  readonly type: 'token';
  getHeaders(): Record<string, string>;
  getHttpsAgent(): https.Agent | undefined;
  validate(): Promise<boolean>;
  dispose(): void;
}

export interface TokenAuthConfig {
  apiUrl: string;
  apiToken: string;
}

export { TokenAuthProvider } from './tokenAuth';
