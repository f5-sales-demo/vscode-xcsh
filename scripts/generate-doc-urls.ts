// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Build-time script to generate documentation URLs from OpenAPI spec files.
 *
 * This script reads all OpenAPI spec files from docs/specifications/api/
 * and extracts documentation URLs to create a TypeScript mapping file.
 *
 * Usage: npx ts-node scripts/generate-doc-urls.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface SpecInfo {
  schemaId: string;
  resourceType: string;
  docUrl: string;
}

/**
 * OpenAPI spec structure (minimal interface for what we need)
 */
interface OpenAPISpec {
  info?: {
    'x-f5xc-api-reference-url'?: string;
    'x-f5xc-cli-domain'?: string;
    externalDocs?: {
      url?: string;
    };
  };
  externalDocs?: {
    url?: string;
  };
  paths?: Record<string, Record<string, { externalDocs?: { url?: string } }>>;
}

const SPEC_DIR = path.join(__dirname, '..', 'docs', 'specifications', 'api');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'generated', 'documentationUrls.ts');
const API_REFERENCE_BASE_URL = 'https://f5-sales-demo.github.io/api-specs-enriched/api-reference';

/**
 * Extract schema identifier from spec filename.
 *
 * Handles two formats:
 * - Individual schema: "docs-cloud-f5-com.0073.public.ves.io.schema.views.http_loadbalancer.ves-swagger.json"
 *   Returns: "ves.io.schema.views.http_loadbalancer"
 * - Domain-level: "blindfold.json"
 *   Returns: null (handled separately via domain key)
 */
function extractSchemaId(filename: string): string | null {
  const match = filename.match(/^docs-cloud-f5-com\.\d+\.public\.(.+)\.ves-swagger\.json$/);
  return match?.[1] ? match[1] : null;
}

/**
 * Extract domain key from a domain-level spec filename.
 * Example: "blindfold.json" -> "blindfold"
 */
function extractDomainKey(filename: string): string | null {
  if (filename.startsWith('docs-cloud-f5-com.')) {
    return null;
  }
  if (filename === 'openapi.json' || filename === 'index.json') {
    return null;
  }
  const match = filename.match(/^([a-z][a-z0-9_]+)\.json$/);
  return match?.[1] ? match[1] : null;
}

/**
 * Derive the resource type key from schema ID.
 * Example: "ves.io.schema.views.http_loadbalancer" -> "http_loadbalancers"
 * Example: "ves.io.schema.app_firewall" -> "app_firewalls"
 */
function deriveResourceType(schemaId: string): string | null {
  // Extract the last part after 'schema.' or 'schema.views.'
  const parts = schemaId.split('.');
  const schemaIndex = parts.indexOf('schema');
  if (schemaIndex === -1 || schemaIndex >= parts.length - 1) {
    return null;
  }

  // Get everything after 'schema'
  const afterSchema = parts.slice(schemaIndex + 1);

  // If it starts with 'views.', take the next part
  if (afterSchema[0] === 'views' && afterSchema.length > 1) {
    const resourceName = afterSchema[1];
    // Convert to plural form used in RESOURCE_TYPES (e.g., http_loadbalancer -> http_loadbalancers)
    return `${resourceName}s`;
  }

  // Otherwise take the first part after schema
  const resourceName = afterSchema[0];
  return `${resourceName}s`;
}

/**
 * Extract the API reference URL from a spec file.
 *
 * Priority:
 * 1. info['x-f5xc-api-reference-url'] — explicit enriched field (single source of truth)
 * 2. First operation's externalDocs.url — fallback for specs without the extension field
 */
function extractDocUrl(specPath: string): string | null {
  try {
    const content = fs.readFileSync(specPath, 'utf-8');
    const spec = JSON.parse(content) as OpenAPISpec;

    // Priority 1: Explicit API reference URL from enrichment
    if (spec.info?.['x-f5xc-api-reference-url']) {
      return spec.info['x-f5xc-api-reference-url'];
    }

    // Priority 2: First operation's externalDocs URL (already rewritten by enricher)
    if (spec.paths) {
      for (const pathObj of Object.values(spec.paths)) {
        for (const method of Object.values(pathObj)) {
          if (method.externalDocs?.url) {
            return method.externalDocs.url;
          }
        }
      }
    }

    return null;
  } catch (e) {
    console.error(`Error reading spec file ${specPath}:`, e);
    return null;
  }
}

/**
 * Main function to generate the documentation URLs mapping.
 */
function main(): void {
  console.log('Generating documentation URLs from OpenAPI specs...');

  if (!fs.existsSync(SPEC_DIR)) {
    console.error(`Spec directory not found: ${SPEC_DIR}`);
    process.exit(1);
  }

  // Sort spec files for deterministic processing order
  const specFiles = fs
    .readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  console.log(`Found ${specFiles.length} spec files`);

  const urlMap: Record<string, string> = {};
  const processed: SpecInfo[] = [];

  for (const filename of specFiles) {
    const specPath = path.join(SPEC_DIR, filename);

    // Try individual schema file first
    const schemaId = extractSchemaId(filename);
    if (schemaId) {
      const resourceType = deriveResourceType(schemaId);
      if (!resourceType) {
        continue;
      }

      const docUrl = extractDocUrl(specPath);
      if (!docUrl) {
        continue;
      }

      if (!urlMap[resourceType]) {
        urlMap[resourceType] = docUrl;
        processed.push({ schemaId, resourceType, docUrl });
      }
      continue;
    }

    // Try domain-level spec file
    const domainKey = extractDomainKey(filename);
    if (domainKey) {
      const docUrl = extractDocUrl(specPath);
      if (!docUrl && !urlMap[domainKey]) {
        const fallbackUrl = `${API_REFERENCE_BASE_URL}/${domainKey}/`;
        urlMap[domainKey] = fallbackUrl;
        processed.push({ schemaId: domainKey, resourceType: domainKey, docUrl: fallbackUrl });
      } else if (docUrl && !urlMap[domainKey]) {
        urlMap[domainKey] = docUrl;
        processed.push({ schemaId: domainKey, resourceType: domainKey, docUrl });
      }
    }
  }

  console.log(`Processed ${processed.length} resource types`);

  // Sort urlMap keys for deterministic output
  const sortedUrlMap: Record<string, string> = {};
  const sortedKeys = Object.keys(urlMap).sort();
  for (const key of sortedKeys) {
    const value = urlMap[key];
    if (value !== undefined) {
      sortedUrlMap[key] = value;
    }
  }

  // Generate TypeScript output
  const output = `/**
 * Auto-generated documentation URLs from OpenAPI spec files.
 * DO NOT EDIT - This file is generated by scripts/generate-doc-urls.ts
 *
 * Total documentation URLs: ${sortedKeys.length}
 */

/**
 * Mapping of resource type keys to their documentation URLs.
 * Resource types use the plural form (e.g., 'http_loadbalancers').
 */
export const DOCUMENTATION_URLS: Record<string, string> = ${JSON.stringify(sortedUrlMap, null, 2)};

/**
 * Get the documentation URL for a resource type.
 * Falls back to the base API reference URL if the resource type is not found.
 *
 * @param resourceType - The resource type key (e.g., 'http_loadbalancers')
 * @returns The documentation URL
 */
export function getDocumentationUrl(resourceType: string): string {
  return DOCUMENTATION_URLS[resourceType] || '${API_REFERENCE_BASE_URL}';
}
`;

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
  console.log(`Generated: ${OUTPUT_FILE}`);

  // Print summary of key mappings
  const keyTypes = [
    'http_loadbalancers',
    'tcp_loadbalancers',
    'origin_pools',
    'app_firewalls',
    'service_policys',
    'healthchecks',
  ];

  console.log('\nKey resource type mappings:');
  for (const type of keyTypes) {
    if (urlMap[type]) {
      console.log(`  ${type}: ${urlMap[type]}`);
    }
  }
}

main();
