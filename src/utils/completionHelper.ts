// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Shared utilities for completion providers.
 * Provides JSON parsing, resource type detection, and snippet generation.
 */

import type * as vscode from 'vscode';
import type { SchemaProperty } from '../schema/schemaGenerator';
import { getSchemaRegistry } from '../schema/schemaRegistry';
import { getManifestKind } from './manifestDetector';

const detectionCache = new Map<string, { version: number; kind: string | undefined }>();

export function clearDetectionCache(): void {
  detectionCache.clear();
}

/**
 * Context information for JSON position
 */
export interface JsonContext {
  /** Path from root to current position (e.g., ['spec', 'domains', '0']) */
  path: string[];
  /** Whether cursor is after a property colon */
  afterColon: boolean;
  /** Whether cursor is in an object */
  inObject: boolean;
  /** Whether cursor is in an array */
  inArray: boolean;
  /** The property name if cursor is after colon */
  propertyName?: string;
  /** Current indentation level */
  indentLevel: number;
  /** Indentation string to use */
  indentString: string;
}

/**
 * Property information for snippet generation
 */
export interface PropertyInfo {
  name: string;
  type: string | string[];
  required: boolean;
  default?: unknown;
  recommendedValue?: unknown;
  description?: string;
  isServerDefault?: boolean;
}

/**
 * Detect resource type from document URI or filename.
 *
 * Supports patterns:
 * - xcsh://profile/namespace/resourceType/resourceName.json
 * - file:///path/to/file.resourceType.json
 * - file:///path/to/resourceType.json
 */
export function detectResourceType(document: vscode.TextDocument): string | undefined {
  const uri = document.uri;

  // Check xcsh:// scheme
  if (uri.scheme === 'xcsh') {
    const parts = uri.path.split('/').filter((p) => p.length > 0);
    if (parts.length >= 2) {
      return parts[1];
    }
  }

  // Check file:// scheme - extract from filename first (fast path)
  if (uri.scheme === 'file') {
    const fromFilename = extractResourceTypeFromFilename(uri.fsPath);
    if (fromFilename) {
      return fromFilename;
    }
  }

  // Content-based fallback: inspect file content for kind field
  return detectResourceTypeFromContent(document);
}

function detectResourceTypeFromContent(document: vscode.TextDocument): string | undefined {
  const cacheKey = document.uri.toString();
  const cached = detectionCache.get(cacheKey);
  if (cached && cached.version === document.version) {
    return cached.kind;
  }

  const kind = getManifestKind(document.getText());
  let validKind: string | undefined;
  if (kind) {
    const registry = getSchemaRegistry();
    if (registry.hasSchema(kind)) {
      validKind = kind;
    }
  }

  detectionCache.set(cacheKey, { version: document.version, kind: validKind });
  return validKind;
}

/**
 * Extract resource type from filename patterns:
 * - my-resource.http_loadbalancer.json -> http_loadbalancer
 * - origin_pool.json -> origin_pool
 * - test.app_firewall.json -> app_firewall
 */
export function extractResourceTypeFromFilename(filename: string): string | undefined {
  const basename = filename.split('/').pop() || filename;

  // Pattern 1: {name}.{resourceType}.json
  const dotMatch = basename.match(/\.([a-z_]+)\.json$/);
  if (dotMatch) {
    return dotMatch[1];
  }

  // Pattern 2: {resourceType}.json (without prefix)
  const simpleMatch = basename.match(/^([a-z_]+)\.json$/);
  if (simpleMatch?.[1]) {
    const candidate = simpleMatch[1];
    // Validate it's a known resource type
    const registry = getSchemaRegistry();
    if (registry.hasSchema(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Parse JSON structure to determine current context at cursor position.
 * Handles incomplete/invalid JSON gracefully.
 */
export function getCurrentJsonContext(document: vscode.TextDocument, position: vscode.Position): JsonContext {
  const text = document.getText();
  const offset = document.offsetAt(position);

  // Get the text up to cursor
  const textBeforeCursor = text.substring(0, offset);

  // Detect indentation
  const line = document.lineAt(position.line);
  const lineText = line.text;
  const indentMatch = lineText.match(/^(\s*)/);
  const indentString = indentMatch?.[1] ? indentMatch[1] : '';
  const indentLevel = calculateIndentLevel(indentString);

  // Check if after colon
  const afterColon = isAfterPropertyColon(textBeforeCursor);

  // Parse JSON path (best effort)
  const path = parseJsonPath(textBeforeCursor);

  // Detect if in object or array
  const { inObject, inArray } = detectContainerType(textBeforeCursor);

  // Get property name if after colon
  const propertyName = afterColon ? getPropertyNameBeforeColon(textBeforeCursor) : undefined;

  return {
    path,
    afterColon,
    inObject,
    inArray,
    propertyName,
    indentLevel,
    indentString,
  };
}

/**
 * Check if cursor is immediately after a property colon
 */
export function isAfterPropertyColon(textBeforeCursor: string): boolean {
  // Look for pattern: "property": <cursor> or "property":<cursor>
  const trimmed = textBeforeCursor.trimEnd();
  return /:\s*$/.test(trimmed);
}

function getPropertyNameBeforeColon(textBeforeCursor: string): string | undefined {
  // Look for last quoted string before colon
  const match = textBeforeCursor.match(/"([^"]+)"\s*:\s*$/);
  return match ? match[1] : undefined;
}

function calculateIndentLevel(indentString: string): number {
  // Assume 2 spaces per level (common JSON convention)
  return Math.floor(indentString.length / 2);
}

function detectContainerType(textBeforeCursor: string): {
  inObject: boolean;
  inArray: boolean;
} {
  let openBraces = 0;
  let openBrackets = 0;

  // Count unmatched brackets/braces, ignoring strings
  let inString = false;
  let escapeNext = false;

  for (const char of textBeforeCursor) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        openBraces++;
      }
      if (char === '}') {
        openBraces--;
      }
      if (char === '[') {
        openBrackets++;
      }
      if (char === ']') {
        openBrackets--;
      }
    }
  }

  return {
    inObject: openBraces > 0,
    inArray: openBrackets > 0,
  };
}

/**
 * Parse JSON path from text (best effort).
 * Returns array of keys/indices from root to current position.
 */
export function parseJsonPath(textBeforeCursor: string): string[] {
  const stack: string[] = [];
  const stackIsNamed: boolean[] = [];
  let inString = false;
  let escapeNext = false;
  let lastKey = '';
  let collectingKey = false;
  let afterColon = false;

  for (let i = 0; i < textBeforeCursor.length; i++) {
    const char = textBeforeCursor[i];

    if (escapeNext) {
      if (collectingKey) {
        lastKey += char;
      }
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      if (inString) {
        inString = false;
        collectingKey = false;
      } else {
        inString = true;
        if (!afterColon) {
          collectingKey = true;
          lastKey = '';
        } else {
          collectingKey = false;
        }
      }
      continue;
    }

    if (inString) {
      if (collectingKey) {
        lastKey += char;
      }
      continue;
    }

    if (char === ':') {
      afterColon = true;
    } else if (char === '{') {
      if (lastKey) {
        stack.push(lastKey);
        stackIsNamed.push(true);
      } else {
        stackIsNamed.push(false);
      }
      lastKey = '';
      afterColon = false;
    } else if (char === '}') {
      const named = stackIsNamed.pop();
      if (named) {
        stack.pop();
      }
      afterColon = false;
      lastKey = '';
    } else if (char === '[') {
      if (lastKey) {
        stack.push(lastKey);
        stackIsNamed.push(true);
      } else {
        stackIsNamed.push(false);
      }
      lastKey = '';
      afterColon = false;
    } else if (char === ']') {
      const named = stackIsNamed.pop();
      if (named) {
        stack.pop();
      }
      afterColon = false;
      lastKey = '';
    } else if (char === ',') {
      afterColon = false;
      lastKey = '';
    }
  }

  return stack;
}

/**
 * Navigate schema structure following a path.
 * Returns the schema node at the path, or undefined if not found.
 */
export function navigateSchemaPath(schema: SchemaProperty, path: string[]): SchemaProperty | undefined {
  let current: SchemaProperty | undefined = schema;

  for (const segment of path) {
    if (!current) {
      return undefined;
    }

    // Check if current is object with properties
    if (current.properties && typeof current.properties === 'object') {
      current = current.properties[segment];
    }
    // Check if current is array with items
    else if (current.type === 'array' && current.items) {
      current = current.items;
    }
    // Can't navigate further
    else {
      return undefined;
    }
  }

  return current;
}

/**
 * Extract recommended value from schema node
 */
export function extractRecommendedValue(schemaNode: SchemaProperty): unknown {
  // Check custom extension first
  if (schemaNode['x-f5xc-recommended-value'] !== undefined) {
    return schemaNode['x-f5xc-recommended-value'];
  }

  // Fall back to default value
  if (schemaNode.default !== undefined) {
    return schemaNode.default;
  }

  return undefined;
}

/**
 * Format a value for JSON insertion (with proper quotes, escaping, etc.)
 */
export function formatValueForJson(value: unknown, type?: string | string[]): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return '""';
  }

  // Determine type
  const actualType = type || typeof value;
  const primaryType = Array.isArray(actualType) ? actualType[0] : actualType;

  switch (primaryType) {
    case 'string':
      return JSON.stringify(String(value));

    case 'number':
    case 'integer':
      return String(value);

    case 'boolean':
      return String(value);

    case 'array':
      if (Array.isArray(value)) {
        return JSON.stringify(value, null, 2);
      }
      return '[]';

    case 'object':
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return '{}';

    default:
      return JSON.stringify(value);
  }
}

/**
 * Create a snippet string with tab stops for multiple properties.
 * Tab stops allow user to navigate with Tab key.
 */
export function createSnippetWithTabStops(properties: PropertyInfo[], indentString: string): string {
  const lines: string[] = [];
  let tabStop = 1;

  for (const prop of properties) {
    const value = prop.recommendedValue ?? prop.default;

    if (value !== undefined) {
      const formattedValue = formatValueForJson(value, prop.type);

      // Create tab stop with default value
      lines.push(`${indentString}"${prop.name}": \${${tabStop}:${formattedValue}}`);
    } else {
      // Create tab stop with placeholder
      const placeholder = getPlaceholderForType(prop.type);
      lines.push(`${indentString}"${prop.name}": \${${tabStop}:${placeholder}}`);
    }

    tabStop++;
  }

  return lines.join(',\n');
}

function getPlaceholderForType(type: string | string[]): string {
  const primaryType = Array.isArray(type) ? type[0] : type;

  switch (primaryType) {
    case 'string':
      return '""';
    case 'number':
    case 'integer':
      return '0';
    case 'boolean':
      return 'false';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    default:
      return '""';
  }
}

/**
 * Generate a complete object template with proper indentation
 */
export function generateObjectTemplate(
  schemaNode: SchemaProperty,
  indentString: string,
  includeOptional: boolean = true,
): string {
  if (!schemaNode.properties) {
    return '{}';
  }

  const properties: PropertyInfo[] = [];

  // Collect required properties first
  const required = schemaNode.required || [];
  for (const propName of required) {
    const propSchema = schemaNode.properties[propName];
    if (propSchema) {
      properties.push({
        name: propName,
        type: propSchema.type || 'string',
        required: true,
        default: propSchema.default,
        recommendedValue: propSchema['x-f5xc-recommended-value'],
        description: propSchema.description,
        isServerDefault: propSchema['x-f5xc-server-default'],
      });
    }
  }

  // Add optional properties with recommended values
  if (includeOptional) {
    for (const [propName, propSchema] of Object.entries(schemaNode.properties)) {
      if (!required.includes(propName)) {
        // Only include if it has a recommended value
        if (propSchema['x-f5xc-recommended-value'] !== undefined) {
          properties.push({
            name: propName,
            type: propSchema.type || 'string',
            required: false,
            default: propSchema.default,
            recommendedValue: propSchema['x-f5xc-recommended-value'],
            description: propSchema.description,
            isServerDefault: propSchema['x-f5xc-server-default'],
          });
        }
      }
    }
  }

  if (properties.length === 0) {
    return '{}';
  }

  const innerIndent = `${indentString}  `;
  const snippetContent = createSnippetWithTabStops(properties, innerIndent);

  return `{\n${snippetContent}\n${indentString}}`;
}

/**
 * Check if a document is an F5 XC JSON file
 */
export function isXCSHJsonFile(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'json') {
    return false;
  }

  if (document.uri.scheme === 'xcsh') {
    return true;
  }

  return detectResourceType(document) !== undefined;
}

/**
 * Get schema for a document
 */
export function getSchemaForDocument(document: vscode.TextDocument): SchemaProperty | undefined {
  const resourceType = detectResourceType(document);
  if (!resourceType) {
    return undefined;
  }

  const registry = getSchemaRegistry();
  const schema = registry.getOrGenerateSchema(resourceType);

  return schema || undefined;
}
