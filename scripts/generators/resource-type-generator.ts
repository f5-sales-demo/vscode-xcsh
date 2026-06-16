// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Resource type generator for F5 XC extension.
 *
 * Generates the base resource types from OpenAPI specifications.
 * These generated types serve as the foundation that can be extended
 * with manual overrides for UI-specific properties like icons and categories.
 *
 * Enriched API specs are the single source of truth for namespace profiles.
 * No manual overrides are needed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadValidationData,
  type NamespaceProfile,
  type ParsedSpecInfo,
  parseAllDomainFiles,
  parseAllSpecs,
  type ResourceFieldMetadata,
  type ResourceOperationMetadata,
} from './spec-parser';

// Re-export types that are used in generated output
export type {
  CommonError,
  DangerLevel,
  FieldMetadata,
  FieldRequiredFor,
  OperationMetadata,
  PerformanceImpact,
  ResourceFieldMetadata,
  ResourceOperationMetadata,
  SideEffects,
} from './spec-parser';

/**
 * Structure of the display name overrides file
 */
interface DisplayNameOverride {
  displayName: string;
  reason?: string;
}

interface DisplayNameOverrides {
  overrides: Record<string, DisplayNameOverride>;
}

/**
 * Load display name overrides from JSON file
 */
function loadDisplayNameOverrides(overridesPath: string): DisplayNameOverrides | null {
  if (!fs.existsSync(overridesPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(overridesPath, 'utf-8');
    return JSON.parse(content) as DisplayNameOverrides;
  } catch (error) {
    console.warn(`Warning: Could not load display name overrides from ${overridesPath}:`, error);
    return null;
  }
}

/**
 * Apply display name overrides to parsed specs
 */
function applyDisplayNameOverrides(specs: ParsedSpecInfo[], overrides: DisplayNameOverrides): number {
  let count = 0;

  for (const spec of specs) {
    const override = overrides.overrides[spec.resourceKey];
    if (override) {
      spec.displayName = override.displayName;
      count++;
    }
  }

  return count;
}

// Re-export types for use by other modules
export { NamespaceProfile, NamespaceType, ParsedSpecInfo } from './spec-parser';

/**
 * Serializable field metadata for generated output.
 * Contains only fields with meaningful metadata (defaults, required-for, or recommended values).
 */
export interface GeneratedFieldMetadata {
  /** Server-provided default value for this field */
  default?: unknown;
  /** Whether server applies a default for this field */
  serverDefault?: boolean;
  /** When this field is required */
  requiredFor?: {
    create?: boolean;
    update?: boolean;
  };
  /** Recommended value for this field (from x-f5xc-recommended-value) */
  recommendedValue?: unknown;
  /** Short description (from x-f5xc-description-short) */
  descriptionShort?: string;
  /** Medium description (from x-f5xc-description-medium) */
  descriptionMedium?: string;
  /** Example value (from x-f5xc-example) */
  example?: unknown;
  /** Validation constraints (from x-f5xc-constraints) */
  constraints?: import('./spec-parser').ConstraintInfo;
  /** Fields this field conflicts with */
  conflictsWith?: string[];
  /** Whether required for minimum configuration */
  isMinimumConfig?: boolean;
  /** Recommended oneof variant */
  recommendedOneofVariant?: string;
  /** Field type inferred from spec (e.g., 'string', 'object', 'array') */
  type?: string;
  /** Enum values from OpenAPI spec (multi-value enums only) */
  enumValues?: unknown[];
  /** OpenAPI description (fallback when descriptionShort is absent) */
  description?: string;
}

/**
 * Generated resource type interface matching what can be extracted from specs
 */
export interface GeneratedResourceTypeInfo {
  /** API path suffix (e.g., 'http_loadbalancers') */
  apiPath: string;
  /** Display name for UI */
  displayName: string;
  /** Description from spec */
  description: string;
  /** API base (e.g., 'config', 'web', 'infraprotect', 'shape', etc.) */
  apiBase: string;
  /** Service segment for extended API paths (e.g., 'dns' for /api/config/dns/namespaces/...) */
  serviceSegment?: string;
  /** Full API path pattern */
  fullApiPath: string;
  /** Schema file name */
  schemaFile: string;
  /** Schema ID */
  schemaId: string;
  /** Whether resource is namespace-scoped */
  namespaceScoped: boolean;
  /** Namespace profile - rich metadata about namespace constraints */
  namespaceProfile: NamespaceProfile;
  /** Documentation URL */
  documentationUrl?: string;
  /** Domain from x-f5xc-cli-domain extension (e.g., 'waf', 'virtual', 'dns') */
  domain?: string;
  /** Operation metadata for CRUD operations (from x-f5xc-operation-metadata) */
  operationMetadata?: ResourceOperationMetadata;
  /** Whether this resource supports manifest-based operations */
  manifestSupported?: boolean;
  /** Field metadata for server defaults and required fields */
  fieldMetadata?: {
    /** Map of field paths to their metadata */
    fields: Record<string, GeneratedFieldMetadata>;
    /** List of field paths that have server defaults */
    serverDefaultFields?: string[];
    /** List of field paths that user must provide at creation */
    userRequiredFields?: string[];
    /** List of field paths that have recommended values */
    recommendedValueFields?: string[];
    /** List of field paths marked as minimum configuration */
    minimumConfigFields?: string[];
    /** List of field paths that have validation constraints */
    constrainedFields?: string[];
  };
  /** Domain-level best practices */
  bestPractices?: import('./spec-parser').BestPracticesInfo;
  /** Guided workflows */
  guidedWorkflows?: unknown[];
}

/**
 * Convert parsed spec info to generated resource type info
 */
function toGeneratedTypeInfo(info: ParsedSpecInfo): GeneratedResourceTypeInfo {
  const result: GeneratedResourceTypeInfo = {
    apiPath: info.apiPath,
    displayName: info.displayName,
    description: info.description,
    apiBase: info.apiBase,
    fullApiPath: info.fullApiPath,
    schemaFile: info.schemaFile,
    schemaId: info.schemaId,
    namespaceScoped: info.namespaceScoped,
    namespaceProfile: info.namespaceProfile,
    documentationUrl: info.documentationUrl,
  };

  // Only include serviceSegment if it's defined
  if (info.serviceSegment) {
    result.serviceSegment = info.serviceSegment;
  }

  // Only include domain if it's defined
  if (info.domain) {
    result.domain = info.domain;
  }

  // Only include operationMetadata if it's defined and has content
  if (info.operationMetadata && Object.keys(info.operationMetadata).length > 0) {
    result.operationMetadata = info.operationMetadata;
  }

  // Set manifestSupported based on whether field metadata was found
  const hasFieldMetadata = info.fieldMetadata && Object.keys(info.fieldMetadata.fields).length > 0;
  result.manifestSupported = !!hasFieldMetadata;

  // Only include fieldMetadata if it's defined and has fields
  if (hasFieldMetadata && info.fieldMetadata) {
    // Convert FieldMetadata to GeneratedFieldMetadata (strip unnecessary properties)
    const generatedFields: Record<string, GeneratedFieldMetadata> = {};

    for (const [path, meta] of Object.entries(info.fieldMetadata.fields)) {
      const genMeta: GeneratedFieldMetadata = {};

      if (meta.default !== undefined) {
        genMeta.default = meta.default;
      }
      if (meta.serverDefault) {
        genMeta.serverDefault = true;
      }
      if (meta.requiredFor) {
        const reqFor: { create?: boolean; update?: boolean } = {};
        if (meta.requiredFor.create !== undefined) {
          reqFor.create = meta.requiredFor.create;
        }
        if (meta.requiredFor.update !== undefined) {
          reqFor.update = meta.requiredFor.update;
        }
        if (Object.keys(reqFor).length > 0) {
          genMeta.requiredFor = reqFor;
        }
      }
      if (meta.recommendedValue !== undefined) {
        genMeta.recommendedValue = meta.recommendedValue;
      }
      if (meta.type) {
        (genMeta as Record<string, unknown>).type = meta.type;
      }
      if (meta.descriptionShort !== undefined) {
        genMeta.descriptionShort = meta.descriptionShort;
      }
      if (meta.descriptionMedium !== undefined) {
        genMeta.descriptionMedium = meta.descriptionMedium;
      }
      if (meta.example !== undefined) {
        genMeta.example = meta.example;
      }
      if (meta.constraints !== undefined) {
        genMeta.constraints = meta.constraints;
      }
      if (meta.conflictsWith && meta.conflictsWith.length > 0) {
        genMeta.conflictsWith = meta.conflictsWith;
      }
      if (meta.isMinimumConfig === true) {
        genMeta.isMinimumConfig = true;
      }
      if (meta.recommendedOneofVariant !== undefined) {
        genMeta.recommendedOneofVariant = meta.recommendedOneofVariant;
      }
      if (meta.enumValues && meta.enumValues.length > 1) {
        genMeta.enumValues = meta.enumValues;
      }
      if (meta.description && !meta.descriptionShort) {
        genMeta.description = meta.description;
      }

      // Include if there's any meaningful data
      if (Object.keys(genMeta).length > 0 || meta.type || meta.description) {
        generatedFields[path] = genMeta;
      }
    }

    // Only include if we have fields after filtering
    if (Object.keys(generatedFields).length > 0) {
      result.fieldMetadata = {
        fields: generatedFields,
      };

      // Include arrays only if they have items
      if (info.fieldMetadata.serverDefaultFields.length > 0) {
        result.fieldMetadata.serverDefaultFields = info.fieldMetadata.serverDefaultFields;
      }
      if (info.fieldMetadata.userRequiredFields.length > 0) {
        result.fieldMetadata.userRequiredFields = info.fieldMetadata.userRequiredFields;
      }
      if (info.fieldMetadata.recommendedValueFields && info.fieldMetadata.recommendedValueFields.length > 0) {
        result.fieldMetadata.recommendedValueFields = info.fieldMetadata.recommendedValueFields;
      }
      if (info.fieldMetadata.minimumConfigFields.length > 0) {
        result.fieldMetadata.minimumConfigFields = info.fieldMetadata.minimumConfigFields;
      }
      if (info.fieldMetadata.constrainedFields.length > 0) {
        result.fieldMetadata.constrainedFields = info.fieldMetadata.constrainedFields;
      }
    }
  }

  if (info.bestPractices && Object.keys(info.bestPractices).length > 0) {
    result.bestPractices = info.bestPractices;
  }

  if (info.guidedWorkflows && info.guidedWorkflows.length > 0) {
    result.guidedWorkflows = info.guidedWorkflows;
  }

  return result;
}

/**
 * Generate the resourceTypesBase.ts file content
 */
export function generateResourceTypesContent(specs: ParsedSpecInfo[]): string {
  // Sort specs by resourceKey for deterministic output
  const sortedSpecs = [...specs].sort((a, b) => a.resourceKey.localeCompare(b.resourceKey));

  // Build the GENERATED_RESOURCE_TYPES object with sorted keys
  const resourceTypes: Record<string, GeneratedResourceTypeInfo> = {};
  for (const spec of sortedSpecs) {
    resourceTypes[spec.resourceKey] = toGeneratedTypeInfo(spec);
  }

  // Build the API_PATH_TO_RESOURCE_KEY reverse lookup (sorted for deterministic output)
  const apiPathToKey: Record<string, string> = {};
  for (const spec of sortedSpecs) {
    apiPathToKey[spec.apiPath] = spec.resourceKey;
  }

  // Pretty print with proper TypeScript formatting
  // Keep double quotes for values since they're properly escaped by JSON.stringify
  // Only remove quotes from keys that are valid JS identifiers (no dots, dashes, etc.)
  const resourceTypesJson = JSON.stringify(resourceTypes, null, 2).replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1:');

  const apiPathToKeyJson = JSON.stringify(apiPathToKey, null, 2).replace(/"([^"]+)":/g, "'$1':"); // Use single quotes for keys in reverse lookup

  return `/**
 * Auto-generated resource types from F5 XC OpenAPI specifications.
 * DO NOT EDIT - This file is generated by scripts/generate-resource-types.ts
 *
 * Total resource types: ${sortedSpecs.length}
 */

/**
 * Namespace type classification for F5 XC namespaces.
 */
export type NamespaceType = 'system' | 'shared' | 'default' | 'custom';

/**
 * Namespace profile - rich metadata about which namespaces a resource type supports.
 */
export interface NamespaceProfile {
  constraint: {
    allowed: NamespaceType[];
    enforced: boolean;
  };
  recommendation: {
    primary: NamespaceType;
    alternatives?: Array<{ namespace_type: NamespaceType; use_case: string }>;
    rationale: string;
  };
  classification: {
    category: string;
    multiTenantPattern: 'none' | 'shared-ref' | 'per-tenant' | 'hybrid';
  };
}

/**
 * Danger level for operations - indicates risk level and affects UI behavior
 */
export type DangerLevel = 'low' | 'medium' | 'high';

/**
 * Common error information from x-f5xc-operation-metadata
 */
export interface CommonError {
  code: number;
  message: string;
  solution: string;
}

/**
 * Performance impact information from x-f5xc-operation-metadata
 */
export interface PerformanceImpact {
  latency: string;
  resourceUsage: string;
}

/**
 * Side effects information from x-f5xc-operation-metadata
 */
export interface SideEffects {
  creates?: string[];
  updates?: string[];
  deletes?: string[];
  invalidates?: string[];
}

/**
 * Operation metadata extracted from x-f5xc-operation-metadata extension.
 * Provides rich context about API operations for UX enhancements.
 */
export interface OperationMetadata {
  /** Human-readable purpose of the operation */
  purpose?: string;
  /** Risk level of the operation */
  dangerLevel?: DangerLevel;
  /** Whether user confirmation should be required */
  confirmationRequired?: boolean;
  /** Required fields for the operation */
  requiredFields?: string[];
  /** Optional fields for the operation */
  optionalFields?: string[];
  /** Prerequisites that must be met before operation */
  prerequisites?: string[];
  /** Expected outcomes after successful operation */
  postconditions?: string[];
  /** Side effects the operation may cause */
  sideEffects?: SideEffects;
  /** Common errors and their solutions */
  commonErrors?: CommonError[];
  /** Performance impact information */
  performanceImpact?: PerformanceImpact;
  /** Discovered response time (from x-f5xc-discovered-response-time) */
  discoveredResponseTime?: string;
  /** Operation-level required fields (from x-f5xc-required-fields) */
  operationRequiredFields?: string[];
  /** Prerequisite resource types (from x-f5xc-requires) */
  requires?: string[];
}

/**
 * Collection of operation metadata for all CRUD operations on a resource
 */
export interface ResourceOperationMetadata {
  list?: OperationMetadata;
  get?: OperationMetadata;
  create?: OperationMetadata;
  update?: OperationMetadata;
  delete?: OperationMetadata;
}

/**
 * Metadata for a single field in a resource schema.
 * Contains server default, required-for, and recommended value information.
 */
export interface GeneratedFieldMetadata {
  /** Server-provided default value for this field */
  default?: unknown;
  /** Whether server applies a default for this field (from x-f5xc-server-default) */
  serverDefault?: boolean;
  /** When this field is required (from x-f5xc-required-for) */
  requiredFor?: {
    create?: boolean;
    update?: boolean;
  };
  /** Recommended value for this field (from x-f5xc-recommended-value) */
  recommendedValue?: unknown;
  /** Short description (from x-f5xc-description-short) */
  descriptionShort?: string;
  /** Medium description (from x-f5xc-description-medium) */
  descriptionMedium?: string;
  /** Example value (from x-f5xc-example) */
  example?: unknown;
  /** Validation constraints (from x-f5xc-constraints) */
  constraints?: {
    constraintType?: string;
    category?: string;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    format?: string;
    formatDescription?: string;
    characterSet?: {
      allowed?: string;
      restricted?: string;
      description?: string;
    };
    deterministic?: boolean;
    minimum?: number;
    maximum?: number;
    multipleOf?: number;
  };
  /** Fields this field conflicts with */
  conflictsWith?: string[];
  /** Whether required for minimum configuration */
  isMinimumConfig?: boolean;
  /** Recommended oneof variant */
  recommendedOneofVariant?: string;
  /** Field type inferred from spec (e.g., 'string', 'object', 'array') */
  type?: string;
  /** Enum values from OpenAPI spec (multi-value enums only) */
  enumValues?: unknown[];
  /** OpenAPI description (fallback when descriptionShort is absent) */
  description?: string;
}

/**
 * Complete field metadata for a resource type.
 * Provides information about server defaults, user requirements, and recommended values.
 */
export interface ResourceFieldMetadata {
  /** Map of field paths to their metadata */
  fields: Record<string, GeneratedFieldMetadata>;
  /** List of field paths that have server defaults */
  serverDefaultFields?: string[];
  /** List of field paths that user must provide at creation */
  userRequiredFields?: string[];
  /** List of field paths that have recommended values */
  recommendedValueFields?: string[];
  /** List of field paths marked as minimum configuration */
  minimumConfigFields?: string[];
  /** List of field paths that have validation constraints */
  constrainedFields?: string[];
}

/**
 * Information about a generated resource type.
 * Contains data that can be extracted directly from OpenAPI specs.
 */
export interface GeneratedResourceTypeInfo {
  /** API path suffix (e.g., 'http_loadbalancers') */
  apiPath: string;
  /** Display name for UI */
  displayName: string;
  /** Description from spec */
  description: string;
  /** API base (e.g., 'config', 'web', 'infraprotect', 'shape', etc.) */
  apiBase: string;
  /** Service segment for extended API paths (e.g., 'dns' for /api/config/dns/namespaces/...) */
  serviceSegment?: string;
  /** Full API path pattern */
  fullApiPath: string;
  /** Schema file name */
  schemaFile: string;
  /** Schema ID (e.g., 'ves.io.schema.views.http_loadbalancer') */
  schemaId: string;
  /** Whether resource is namespace-scoped */
  namespaceScoped: boolean;
  /** Namespace profile - rich metadata about namespace constraints */
  namespaceProfile: NamespaceProfile;
  /** Documentation URL */
  documentationUrl?: string;
  /** Domain from x-f5xc-cli-domain extension (e.g., 'waf', 'virtual', 'dns') */
  domain?: string;
  /** Operation metadata for CRUD operations (from x-f5xc-operation-metadata) */
  operationMetadata?: ResourceOperationMetadata;
  /** Whether this resource supports manifest-based operations (kind/metadata/spec) */
  manifestSupported?: boolean;
  /** Field metadata for server defaults and required fields */
  fieldMetadata?: ResourceFieldMetadata;
  /** Domain-level best practices */
  bestPractices?: {
    commonErrors?: Array<{
      code: number;
      message: string;
      resolution: string;
      prevention?: string;
    }>;
    securityNotes?: string[];
    performanceTips?: string[];
  };
  /** Guided workflows */
  guidedWorkflows?: unknown[];
}

/**
 * Auto-generated resource types from OpenAPI specifications.
 * This is the base data that gets merged with manual overrides.
 */
export const GENERATED_RESOURCE_TYPES: Record<string, GeneratedResourceTypeInfo> = ${resourceTypesJson};

/**
 * Reverse lookup: API path suffix -> resource key
 * Useful for parsing API responses back to resource types.
 */
export const API_PATH_TO_RESOURCE_KEY: Record<string, string> = ${apiPathToKeyJson};

/**
 * Get the resource key from an API path suffix.
 *
 * @param apiPath - The API path suffix (e.g., 'http_loadbalancers')
 * @returns The resource key or undefined if not found
 */
export function getResourceKeyFromApiPath(apiPath: string): string | undefined {
  return API_PATH_TO_RESOURCE_KEY[apiPath];
}

/**
 * Get the generated resource type info for a key.
 *
 * @param key - The resource key (e.g., 'http_loadbalancer')
 * @returns The generated resource type info or undefined
 */
export function getGeneratedResourceType(key: string): GeneratedResourceTypeInfo | undefined {
  return GENERATED_RESOURCE_TYPES[key];
}

/**
 * Get all generated resource type keys.
 *
 * @returns Array of all resource type keys
 */
export function getAllGeneratedResourceKeys(): string[] {
  return Object.keys(GENERATED_RESOURCE_TYPES);
}
`;
}

/**
 * Generate resource types from spec files and write to output file
 * @param specDir - Directory containing OpenAPI spec files
 * @param outputPath - Path for generated TypeScript file
 * @param displayNameOverridesPath - Optional path to display name overrides JSON file
 */
export function generateResourceTypesFile(
  specDir: string,
  outputPath: string,
  displayNameOverridesPath?: string,
): ParsedSpecInfo[] {
  const specs = parseAllSpecs(specDir);

  if (specs.length === 0) {
    console.error('No specs parsed successfully');
    return [];
  }

  // Apply display name overrides if provided
  if (displayNameOverridesPath) {
    const overrides = loadDisplayNameOverrides(displayNameOverridesPath);
    if (overrides) {
      const overrideCount = applyDisplayNameOverrides(specs, overrides);
      console.log(`Applied ${overrideCount} display name overrides`);
    }
  }

  const content = generateResourceTypesContent(specs);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`Generated: ${outputPath} with ${specs.length} resource types`);

  return specs;
}

/**
 * Generate resource types from domain files and write to output file.
 * Domain files are merged OpenAPI specs organized by x-f5xc-cli-domain.
 *
 * @param domainDir - Directory containing domain-based OpenAPI spec files
 * @param outputPath - Path for generated TypeScript file
 * @param displayNameOverridesPath - Optional path to display name overrides JSON file
 */
export function generateResourceTypesFromDomainFiles(
  domainDir: string,
  outputPath: string,
  displayNameOverridesPath?: string,
): ParsedSpecInfo[] {
  const allParsed = parseAllDomainFiles(domainDir);

  if (allParsed.length === 0) {
    console.error('No specs parsed successfully from domain files');
    return [];
  }

  console.log(`Parsed ${allParsed.length} resource types from domain files`);

  // Merge validation.json data into fieldMetadata
  const validationPath = path.join(domainDir, 'validation.json');
  const validationData = loadValidationData(validationPath);
  let validationMergeCount = 0;

  if (validationData) {
    for (const spec of allParsed) {
      const valEntry = validationData.required_fields.resources[spec.resourceKey];
      if (!valEntry) {
        continue;
      }

      // Ensure fieldMetadata exists with empty defaults
      if (!spec.fieldMetadata) {
        const defaultMeta: ResourceFieldMetadata = {
          fields: {},
          serverDefaultFields: [],
          userRequiredFields: [],
          minimumConfigFields: [],
          constrainedFields: [],
        };
        spec.fieldMetadata = defaultMeta;
      }

      // Override userRequiredFields with validation create array
      if (Array.isArray(valEntry.create)) {
        spec.fieldMetadata.userRequiredFields = valEntry.create;
      }

      // Override minimumConfigFields with validation minimum_config array
      if (Array.isArray(valEntry.minimum_config)) {
        spec.fieldMetadata.minimumConfigFields = valEntry.minimum_config;
      }

      validationMergeCount++;
    }
    console.log(`  Merged validation data for ${validationMergeCount} resources`);
  }

  const specs = allParsed;

  // Apply display name overrides if provided
  if (displayNameOverridesPath) {
    const overrides = loadDisplayNameOverrides(displayNameOverridesPath);
    if (overrides) {
      const overrideCount = applyDisplayNameOverrides(specs, overrides);
      console.log(`Applied ${overrideCount} display name overrides`);
    }
  }

  const content = generateResourceTypesContent(specs);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`Generated: ${outputPath} with ${specs.length} resource types`);

  return specs;
}
