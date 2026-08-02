// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Schema Provider for F5 XC resource types.
 * Provides JSON Schemas via the xcsh-schema:// URI scheme for VSCode's JSON IntelliSense.
 */

import * as vscode from 'vscode';
import { getSchemaRegistry } from '../schema/schemaRegistry';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/**
 * TextDocumentContentProvider for F5 XC JSON Schemas.
 * Enables VSCode's JSON language service to fetch schemas for IntelliSense.
 *
 * URI format: xcsh-schema://schemas/{resourceType}.json
 * Examples:
 *   - xcsh-schema://schemas/http_loadbalancer.json
 *   - xcsh-schema://schemas/origin_pool.json
 *   - xcsh-schema://schemas/generic.json
 */
export class XCSHSchemaProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  /**
   * Provide the content for a schema URI.
   * VSCode's JSON language service calls this when it needs a schema.
   */
  provideTextDocumentContent(uri: vscode.Uri): string {
    // Parse the URI to extract resource type
    // URI format: xcsh-schema://schemas/{resourceType}.json
    // VSCode parses this as:
    //   - scheme: "xcsh-schema"
    //   - authority: "schemas"
    //   - path: "/{resourceType}.json"

    let resourceType: string | undefined;

    // First check if authority is "schemas" and extract from path
    if (uri.authority === 'schemas') {
      // Path format: /{resourceType}.json or {resourceType}.json
      const match = uri.path.match(/\/?(.+)\.json$/);
      if (match) {
        resourceType = match[1];
      }
    } else {
      // Fallback: try old format where "schemas" is in the path
      const match = uri.path.match(/\/?schemas\/(.+)\.json$/);
      if (match) {
        resourceType = match[1];
      }
    }

    if (!resourceType) {
      logger.warn('schema.unavailable');
      return this.getErrorSchema(uri.toString());
    }

    logger.debug('schema.generated');

    const registry = getSchemaRegistry();
    return registry.getSchemaContent(resourceType);
  }

  /**
   * Generate an error schema when the URI is invalid.
   */
  private getErrorSchema(uri: string): string {
    return JSON.stringify(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'Error',
        description: `Invalid schema URI: ${uri}`,
        type: 'object',
      },
      null,
      2,
    );
  }

  /**
   * Notify that a schema has changed (e.g., after regeneration).
   */
  notifySchemaChanged(resourceType: string): void {
    const uri = vscode.Uri.parse(`xcsh-schema://schemas/${resourceType}.json`);
    this._onDidChange.fire(uri);
    logger.debug('schema.generated');
  }

  /**
   * Notify that all schemas have changed.
   */
  notifyAllSchemasChanged(): void {
    const registry = getSchemaRegistry();
    for (const resourceType of registry.getAvailableResourceTypes()) {
      this.notifySchemaChanged(resourceType);
    }
    this.notifySchemaChanged('generic');
    logger.debug('schema.generated');
  }
}

/**
 * Get the schema URI for a specific xcsh:// document URI.
 * Extracts the resource type from the document URI and returns the schema URI.
 *
 * @param documentUri - The xcsh:// URI of the document
 * @returns The xcsh-schema:// URI for the schema, or null if not applicable
 */
export function getSchemaUriForDocument(documentUri: vscode.Uri): vscode.Uri | null {
  if (documentUri.scheme !== 'xcsh') {
    return null;
  }

  // Parse the URI: xcsh://profile/namespace/resourceType/resourceName.json
  const parts = documentUri.path.split('/').filter((p) => p.length > 0);

  if (parts.length < 3) {
    return null;
  }

  // resourceType is the second-to-last part (before resourceName.json)
  const resourceType = parts[1];

  if (!resourceType) {
    return null;
  }

  const registry = getSchemaRegistry();
  if (registry.hasSchema(resourceType)) {
    return vscode.Uri.parse(`xcsh-schema://schemas/${resourceType}.json`);
  }

  // Fall back to generic schema
  return vscode.Uri.parse('xcsh-schema://schemas/generic.json');
}
