// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { SchemaProperty } from '../schema/schemaGenerator';
import { getSchemaRegistry } from '../schema/schemaRegistry';
import { detectResourceType, isF5XCJsonFile, navigateSchemaPath } from '../utils/completionHelper';

export class F5XCHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (!isF5XCJsonFile(document)) {
      return undefined;
    }

    const resourceType = detectResourceType(document);
    if (!resourceType) {
      return undefined;
    }

    const propertyName = extractPropertyAtPosition(document, position);
    if (!propertyName) {
      return undefined;
    }

    const registry = getSchemaRegistry();
    const schema = registry.getOrGenerateSchema(resourceType);
    if (!schema) {
      return undefined;
    }

    const fieldPath = resolveFieldPath(document, position, propertyName);
    const schemaNode = navigateSchemaPath(schema, fieldPath);
    if (!schemaNode) {
      return undefined;
    }

    const markdown = buildHoverContent(propertyName, schemaNode, fieldPath);
    if (!markdown) {
      return undefined;
    }

    const range = document.getWordRangeAtPosition(position, /"[^"]+"/);
    return new vscode.Hover(markdown, range);
  }
}

function extractPropertyAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  const line = document.lineAt(position.line).text;
  const match = line.match(/"([^"]+)"\s*:/);
  if (!match?.[1]) {
    return undefined;
  }

  const keyStart = line.indexOf(`"${match[1]}"`);
  const keyEnd = keyStart + match[1].length + 2;
  if (position.character >= keyStart && position.character <= keyEnd) {
    return match[1];
  }

  return undefined;
}

function resolveFieldPath(document: vscode.TextDocument, position: vscode.Position, propertyName: string): string[] {
  const path: string[] = [];
  let inString = false;

  const fullText = document.getText();
  const lines = fullText.split('\n');
  const textBeforeLines = lines.slice(0, position.line + 1);
  textBeforeLines[textBeforeLines.length - 1] = (textBeforeLines[textBeforeLines.length - 1] ?? '').substring(
    0,
    position.character,
  );
  const textBefore = textBeforeLines.join('\n');

  let braceDepth = 0;
  for (const char of textBefore) {
    if (char === '"') {
      inString = !inString;
    }
    if (!inString) {
      if (char === '{') {
        braceDepth++;
      }
      if (char === '}') {
        braceDepth--;
      }
    }
  }

  const tbLines = textBefore.split('\n');
  let depth = braceDepth;
  for (let i = tbLines.length - 1; i >= 0 && depth > 0; i--) {
    const lineMatch = tbLines[i]?.match(/"([^"]+)"\s*:\s*\{/);
    if (lineMatch?.[1]) {
      path.unshift(lineMatch[1]);
      depth--;
    }
  }

  path.push(propertyName);
  return path;
}

function buildHoverContent(
  propertyName: string,
  schemaNode: SchemaProperty,
  _fieldPath: string[],
): vscode.MarkdownString | undefined {
  const lines: string[] = [];
  const typeStr = schemaNode.type
    ? Array.isArray(schemaNode.type)
      ? schemaNode.type.join(' | ')
      : schemaNode.type
    : '';

  lines.push(`**${propertyName}** \`${typeStr}\``);

  const desc = schemaNode.description?.replace(/ \(Server provides default value\)$/, '');
  if (desc) {
    lines.push('', desc);
  }

  const constraints: string[][] = [];
  if (schemaNode['x-f5xc-required']) {
    constraints.push(['Required', 'Yes']);
  }
  if (schemaNode['x-f5xc-server-default']) {
    constraints.push(['Server default', 'Yes']);
  }
  if (typeof schemaNode.maxLength === 'number') {
    constraints.push(['Max length', String(schemaNode.maxLength)]);
  }
  if (typeof schemaNode.minLength === 'number' && schemaNode.minLength > 0) {
    constraints.push(['Min length', String(schemaNode.minLength)]);
  }
  if (schemaNode['x-f5xc-format-description']) {
    constraints.push(['Format', String(schemaNode['x-f5xc-format-description'])]);
  } else if (schemaNode.pattern) {
    constraints.push(['Pattern', `\`${String(schemaNode.pattern)}\``]);
  }
  if (constraints.length > 0) {
    lines.push('', '| | |', '|---|---|');
    for (const [k, v] of constraints) {
      lines.push(`| ${k} | ${v} |`);
    }
  }

  if (schemaNode.enum && schemaNode.enum.length > 0) {
    const vals = schemaNode.enum.map((v) => `\`${String(v)}\``).join(' | ');
    lines.push('', `**Values:** ${vals}`);
  }

  if (schemaNode['x-f5xc-recommended-value'] !== undefined) {
    lines.push('', `**Recommended:** \`${JSON.stringify(schemaNode['x-f5xc-recommended-value'])}\``);
  }

  if (schemaNode['x-f5xc-conflicts-with']) {
    const conflicts = schemaNode['x-f5xc-conflicts-with'].map((f) => `\`${f}\``).join(', ');
    lines.push('', `**Conflicts with:** ${conflicts}`);
  }

  if (schemaNode.examples && schemaNode.examples.length > 0) {
    lines.push('', '```json', `"${propertyName}": ${JSON.stringify(schemaNode.examples[0])}`, '```');
  }

  if (lines.length <= 1) {
    return undefined;
  }

  const md = new vscode.MarkdownString(lines.join('\n'));
  return md;
}
