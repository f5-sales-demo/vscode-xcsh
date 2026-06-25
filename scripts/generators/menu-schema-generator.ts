// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Menu Schema Generator
 *
 * Analyzes OpenAPI specs to generate a deterministic menu schema
 * for different namespace types (system, shared, default, custom).
 *
 * This script produces a JSON schema that defines exactly which
 * resource types appear in each namespace context.
 *
 * The process:
 * 1. Parse all OpenAPI specs and derive namespace scope from API paths
 * 2. Generate menu schema showing resources per namespace type
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeDescription } from './description-normalizer';
import {
  loadNamespaceProfiles,
  type NamespaceProfilesMap,
  type NamespaceType,
  resolveNamespaceProfile,
} from './spec-parser';

/**
 * API path analysis result
 */
interface PathAnalysis {
  path: string;
  hasSystemLiteral: boolean;
  hasSharedLiteral: boolean;
  hasNamespaceParam: boolean;
  hasMetadataNamespaceParam: boolean;
  isNamespaceScoped: boolean;
}

/**
 * Resource type with all its API paths analyzed
 */
interface ResourceAnalysis {
  resourceKey: string;
  displayName: string;
  description: string;
  apiBase: 'config' | 'web';
  schemaFile: string;
  paths: PathAnalysis[];
  allowedNamespaces: NamespaceType[];
}

/**
 * Menu schema for a specific namespace type
 */
interface NamespaceMenuSchema {
  namespaceType: 'system' | 'shared' | 'default' | 'custom';
  description: string;
  categories: {
    [category: string]: {
      icon: string;
      resources: {
        key: string;
        displayName: string;
        apiPath: string;
        allowedNamespaces: NamespaceType[];
      }[];
    };
  };
  resourceCount: number;
}

/**
 * Complete menu schema output
 */
interface MenuSchemaOutput {
  totalSpecs: number;
  totalResources: number;
  scopeSummary: {
    system: number;
    shared: number;
    default: number;
    custom: number;
  };
  namespaceSchemas: {
    system: NamespaceMenuSchema;
    shared: NamespaceMenuSchema;
    default: NamespaceMenuSchema;
    custom: NamespaceMenuSchema;
  };
  resourceAnalysis: ResourceAnalysis[];
}

/**
 * Category configuration - maps resource patterns to categories
 */
const CATEGORY_MAPPINGS: { pattern: RegExp; category: string; icon: string }[] = [
  // Load Balancing
  {
    pattern: /loadbalancer|origin_pool|healthcheck|route|endpoint/i,
    category: 'Load Balancing',
    icon: 'server-process',
  },
  // Security
  {
    pattern: /firewall|waf|security|policy|malicious|bot_defense/i,
    category: 'Security',
    icon: 'shield',
  },
  // Networking
  {
    pattern: /network|virtual_network|vn_|segment|route_table|interface/i,
    category: 'Networking',
    icon: 'type-hierarchy',
  },
  // Sites
  {
    pattern: /site|aws_vpc|azure_vnet|gcp_vpc|voltstack|fleet/i,
    category: 'Sites',
    icon: 'server',
  },
  // DNS
  { pattern: /dns|zone|record/i, category: 'DNS', icon: 'globe' },
  // IAM
  {
    pattern: /user|role|credential|api_credential|service_credential|namespace_role|known_label/i,
    category: 'Identity & Access',
    icon: 'account',
  },
  // Observability
  { pattern: /alert|log|metric|monitor|trace/i, category: 'Observability', icon: 'graph' },
  // Cloud Connect
  {
    pattern: /cloud_connect|cloud_link|aws_tgw|azure_vwan/i,
    category: 'Cloud Connect',
    icon: 'cloud',
  },
  // API Protection
  {
    pattern: /api_definition|api_discovery|api_endpoint/i,
    category: 'API Protection',
    icon: 'lock',
  },
  // Service Mesh
  { pattern: /service_mesh|mesh|sidecar/i, category: 'Service Mesh', icon: 'extensions' },
  // Default
  { pattern: /.*/, category: 'Configuration', icon: 'settings-gear' },
];

/**
 * Analyze a single API path for namespace patterns
 */
function analyzePath(apiPath: string): PathAnalysis {
  return {
    path: apiPath,
    hasSystemLiteral: apiPath.includes('/namespaces/system/'),
    hasSharedLiteral: apiPath.includes('/namespaces/shared/'),
    hasNamespaceParam: apiPath.includes('/namespaces/{namespace}/'),
    hasMetadataNamespaceParam: apiPath.includes('/namespaces/{metadata.namespace}/'),
    isNamespaceScoped: apiPath.includes('/namespaces/'),
  };
}

/**
 * Determine category for a resource
 */
function getCategory(resourceKey: string, displayName: string): { category: string; icon: string } {
  const searchText = `${resourceKey} ${displayName}`.toLowerCase();

  for (const mapping of CATEGORY_MAPPINGS) {
    if (mapping.pattern.test(searchText)) {
      return { category: mapping.category, icon: mapping.icon };
    }
  }

  return { category: 'Configuration', icon: 'settings-gear' };
}

/**
 * Path item structure for menu schema parsing
 */
interface MenuPathItem {
  'x-displayname'?: string;
  get?: { operationId?: string; description?: string };
  post?: { operationId?: string; description?: string };
  put?: { operationId?: string; description?: string };
  delete?: { operationId?: string; description?: string };
}

/**
 * OpenAPI spec structure (minimal interface for what we need)
 */
interface OpenAPISpec {
  info?: {
    title?: string;
    description?: string;
    'x-f5xc-cli-domain'?: string;
  };
  paths?: Record<string, MenuPathItem>;
}

/**
 * Derive resource key from API path suffix (plural -> singular).
 * Example: "http_loadbalancers" -> "http_loadbalancer"
 */
function deriveResourceKeyFromApiPath(apiPathSuffix: string): string {
  if (apiPathSuffix.endsWith('ies')) {
    return `${apiPathSuffix.slice(0, -3)}y`;
  }
  if (apiPathSuffix.endsWith('ses')) {
    return apiPathSuffix.slice(0, -2);
  }
  if (apiPathSuffix.endsWith('s')) {
    return apiPathSuffix.slice(0, -1);
  }
  return apiPathSuffix;
}

/**
 * Parse a domain-format OpenAPI spec file and extract all resource types.
 * Domain files contain multiple resources (e.g., virtual.json has http_loadbalancers, origin_pools, etc.)
 */
function parseDomainSpec(filePath: string, profilesMap: NamespaceProfilesMap): ResourceAnalysis[] {
  const results: ResourceAnalysis[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const spec = JSON.parse(content) as OpenAPISpec;
    const filename = path.basename(filePath);

    const domain = spec.info?.['x-f5xc-cli-domain'];
    if (!domain) {
      // Skip files without x-f5xc-cli-domain
      return [];
    }

    const paths = spec.paths;
    if (!paths) {
      return [];
    }

    // Pattern for list endpoints (plural resource path, no trailing {name})
    // Matches: /api/config/namespaces/{metadata.namespace}/http_loadbalancers
    // Also matches extended paths: /api/config/dns/namespaces/{ns}/dns_zones
    // Character classes include digits so versioned resources (e.g. v1_dns_monitors) parse.
    const listEndpointPattern =
      /^\/api\/([a-z0-9_-]+)(?:\/([a-z0-9_]+))?\/namespaces\/(?:\{[^}]+\}|system|shared)\/([a-z0-9_]+)$/;

    const seen = new Set<string>();

    for (const [pathKey, pathItem] of Object.entries(paths)) {
      const match = pathKey.match(listEndpointPattern);
      if (!match) {
        continue;
      }

      const apiBase = match[1] as 'config' | 'web';
      const apiPathSuffix = match[3];

      if (!apiBase || !apiPathSuffix) {
        continue;
      }

      // Skip item endpoints (they end with /{name} but we already filtered those out via regex)
      if (pathKey.endsWith('}')) {
        continue;
      }

      const resourceKey = deriveResourceKeyFromApiPath(apiPathSuffix);

      // Skip duplicates within the same domain file
      if (seen.has(resourceKey)) {
        continue;
      }
      seen.add(resourceKey);

      // Get display name from x-displayname extension or generate from resource key
      const rawDisplayName = pathItem['x-displayname'] || resourceKey;
      let displayName = rawDisplayName.replace(/\.$/, '');
      if (!displayName.endsWith('s') && !displayName.endsWith('ing')) {
        displayName += 's';
      }

      // Get description from first operation
      let descriptionRaw = '';
      for (const method of ['get', 'post'] as const) {
        const operation = pathItem[method];
        if (operation?.description) {
          descriptionRaw = operation.description;
          break;
        }
      }

      // Record path analysis (informational only) for the output schema.
      const analyzedPaths = [analyzePath(pathKey)];
      const itemPathKey = `${pathKey}/{name}`;
      if (paths[itemPathKey]) {
        analyzedPaths.push(analyzePath(itemPathKey));
      }

      // Allowed namespaces come authoritatively from the namespace profiles map,
      // keyed by resource (single source of truth — no path/profile derivation).
      const allowedNamespaces = resolveNamespaceProfile(profilesMap, resourceKey).constraint.allowed;

      results.push({
        resourceKey,
        displayName,
        description: normalizeDescription(descriptionRaw.substring(0, 200)),
        apiBase,
        schemaFile: filename,
        paths: analyzedPaths,
        allowedNamespaces,
      });
    }
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
  }
  return results;
}

/**
 * Check if a resource should appear in a given namespace type
 */
function isResourceAvailableForNamespace(resource: ResourceAnalysis, namespaceType: NamespaceType): boolean {
  return resource.allowedNamespaces.includes(namespaceType);
}

/**
 * Build menu schema for a specific namespace type
 */
function buildNamespaceSchema(
  resources: ResourceAnalysis[],
  namespaceType: 'system' | 'shared' | 'default' | 'custom',
): NamespaceMenuSchema {
  const categories: NamespaceMenuSchema['categories'] = {};

  const descriptions: Record<'system' | 'shared' | 'default' | 'custom', string> = {
    system: 'System namespace - contains tenant-level system resources like Sites and IAM objects',
    shared: 'Shared namespace - resources shared across all namespaces',
    default: 'Default namespace - standard user namespace for application resources',
    custom: 'Custom namespaces - user-created namespaces for organizing application resources',
  };

  let resourceCount = 0;

  for (const resource of resources) {
    if (!isResourceAvailableForNamespace(resource, namespaceType)) {
      continue;
    }

    const { category, icon } = getCategory(resource.resourceKey, resource.displayName);

    if (!categories[category]) {
      categories[category] = {
        icon,
        resources: [],
      };
    }

    categories[category].resources.push({
      key: resource.resourceKey,
      displayName: resource.displayName,
      apiPath: `${resource.resourceKey}s`, // Simplified - actual apiPath would need more logic
      allowedNamespaces: resource.allowedNamespaces,
    });

    resourceCount++;
  }

  // Sort resources within each category
  for (const cat of Object.values(categories)) {
    cat.resources.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return {
    namespaceType,
    description: descriptions[namespaceType],
    categories,
    resourceCount,
  };
}

/**
 * Main generator function
 */
function generateMenuSchema(specsDir: string, outputPath: string): void {
  console.log('Generating menu schema from OpenAPI specs...\n');

  // The namespace profiles map is the authoritative source of namespace scope.
  // It ships alongside the domain specs (in domains/) and is required.
  const profilesMap = loadNamespaceProfiles(path.join(specsDir, 'namespace_profiles.json'));

  // Find all spec files (domain JSON files in new structure)
  const specFiles = fs
    .readdirSync(specsDir)
    .filter((f) => f.endsWith('.json') && !f.includes('index'))
    .map((f) => path.join(specsDir, f));

  console.log(`Found ${specFiles.length} spec files\n`);

  // Parse all domain specs (each file may contain multiple resources)
  const resources: ResourceAnalysis[] = [];
  const seenKeys = new Set<string>();
  for (const file of specFiles) {
    const analyses = parseDomainSpec(file, profilesMap);
    for (const analysis of analyses) {
      // Deduplicate across files (prefer first occurrence)
      if (!seenKeys.has(analysis.resourceKey)) {
        seenKeys.add(analysis.resourceKey);
        resources.push(analysis);
      }
    }
  }

  // Sort by resource key
  resources.sort((a, b) => a.resourceKey.localeCompare(b.resourceKey));

  console.log(`Successfully parsed ${resources.length} resource types\n`);

  // Count by namespace type
  const scopeCounts = {
    system: resources.filter((r) => r.allowedNamespaces.includes('system')).length,
    shared: resources.filter((r) => r.allowedNamespaces.includes('shared')).length,
    default: resources.filter((r) => r.allowedNamespaces.includes('default')).length,
    custom: resources.filter((r) => r.allowedNamespaces.includes('custom')).length,
  };

  console.log('Namespace distribution:');
  console.log(`  system: ${scopeCounts.system} resources`);
  console.log(`  shared: ${scopeCounts.shared} resources`);
  console.log(`  default: ${scopeCounts.default} resources`);
  console.log(`  custom: ${scopeCounts.custom} resources\n`);

  // Build namespace schemas (no timestamp for deterministic output)
  const output: MenuSchemaOutput = {
    totalSpecs: specFiles.length,
    totalResources: resources.length,
    scopeSummary: scopeCounts,
    namespaceSchemas: {
      system: buildNamespaceSchema(resources, 'system'),
      shared: buildNamespaceSchema(resources, 'shared'),
      default: buildNamespaceSchema(resources, 'default'),
      custom: buildNamespaceSchema(resources, 'custom'),
    },
    resourceAnalysis: resources,
  };

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Generated: ${outputPath}`);

  // Print summary
  console.log('\nMenu schema summary:');
  console.log(
    `  system namespace: ${output.namespaceSchemas.system.resourceCount} resources in ${Object.keys(output.namespaceSchemas.system.categories).length} categories`,
  );
  console.log(
    `  shared namespace: ${output.namespaceSchemas.shared.resourceCount} resources in ${Object.keys(output.namespaceSchemas.shared.categories).length} categories`,
  );
  console.log(
    `  default namespace: ${output.namespaceSchemas.default.resourceCount} resources in ${Object.keys(output.namespaceSchemas.default.categories).length} categories`,
  );
  console.log(
    `  custom namespaces: ${output.namespaceSchemas.custom.resourceCount} resources in ${Object.keys(output.namespaceSchemas.custom.categories).length} categories`,
  );
}

// Main execution
const specsDir = path.join(__dirname, '../../docs/specifications/api/domains');
const outputPath = path.join(__dirname, '../../src/generated/menuSchema.json');

generateMenuSchema(specsDir, outputPath);

console.log('\n=== Generation Complete ===');
