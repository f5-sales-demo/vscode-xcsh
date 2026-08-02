// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as https from 'node:https';
import { API_ENDPOINTS } from '../../generated/constants';
import { getLogger } from '../../utils/logger';
import type { AuthProvider, TokenAuthConfig } from './index';

/**
 * API Token-based authentication provider for F5 XC
 */
export class TokenAuthProvider implements AuthProvider {
  readonly type = 'token' as const;
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly logger = getLogger();

  constructor(config: TokenAuthConfig) {
    this.apiUrl = config.apiUrl.trim();

    // Defensive trimming to prevent whitespace issues (e.g., trailing newlines from $(cat file))
    const trimmedToken = config.apiToken.trim();
    if (!trimmedToken) {
      throw new Error('API token cannot be empty');
    }
    this.apiToken = trimmedToken;
  }

  getHeaders(): Record<string, string> {
    return {
      Authorization: `APIToken ${this.apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  getHttpsAgent(): https.Agent | undefined {
    // Token auth doesn't require a custom HTTPS agent
    return undefined;
  }

  async validate(): Promise<boolean> {
    this.logger.debug('auth.validation.started');

    try {
      const headers = this.getHeaders();

      return new Promise((resolve) => {
        const url = new URL(API_ENDPOINTS.NAMESPACES, this.apiUrl);

        const options: https.RequestOptions = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'GET',
          headers,
          timeout: 10000,
        };

        const req = https.request(options, (res) => {
          if (res.statusCode === 200) {
            this.logger.info('auth.validation.succeeded');
            resolve(true);
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            this.logger.warn('auth.validation.failed');
            resolve(false);
          } else {
            this.logger.warn('auth.validation.failed');
            resolve(false);
          }

          // Consume response data to free up memory
          res.resume();
        });

        req.on('error', (error) => {
          void error;
          this.logger.error('auth.validation.failed');
          resolve(false);
        });

        req.on('timeout', () => {
          this.logger.warn('auth.validation.timed-out');
          req.destroy();
          resolve(false);
        });

        req.end();
      });
    } catch (error) {
      void error;
      this.logger.error('auth.validation.failed');
      return false;
    }
  }

  dispose(): void {
    // No resources to clean up for token auth
  }
}
