// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * OpenAPI specification parsing utilities for F5 XC resource type generation.
 *
 * This module provides functions to parse OpenAPI spec files and extract
 * resource type information for code generation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeDescription } from './description-normalizer';

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
 * Authoritative resource→namespace-profile map, loaded from the upstream
 * namespace_profiles.json artifact. This is the SINGLE SOURCE OF TRUTH for which
 * namespaces a resource type may live in. A resource resolves to
 * `resources[resourceKey]`, falling back to `default` when not explicitly listed.
 */
export interface NamespaceProfilesMap {
  default: NamespaceProfile;
  resources: Record<string, NamespaceProfile>;
}

/**
 * Raw namespace profile shape as authored in YAML/JSON (snake_case keys).
 */
interface RawNamespaceProfile {
  constraint?: { allowed?: string[]; enforced?: boolean };
  recommendation?: {
    primary?: string;
    alternatives?: Array<{ namespace_type?: string; use_case?: string }>;
    rationale?: string;
  };
  classification?: { category?: string; multi_tenant_pattern?: string; multiTenantPattern?: string };
}

const VALID_NAMESPACE_TYPES: ReadonlySet<NamespaceType> = new Set<NamespaceType>([
  'system',
  'shared',
  'default',
  'custom',
]);

const VALID_MULTI_TENANT_PATTERNS = ['none', 'shared-ref', 'per-tenant', 'hybrid'] as const;

/**
 * Normalize a raw profile (snake_case, loosely typed) into the strict
 * NamespaceProfile shape used throughout the extension.
 */
export function normalizeProfile(raw: RawNamespaceProfile): NamespaceProfile {
  const allowed = (raw.constraint?.allowed ?? []).filter((v): v is NamespaceType =>
    VALID_NAMESPACE_TYPES.has(v as NamespaceType),
  );

  const rawPattern = raw.classification?.multi_tenant_pattern ?? raw.classification?.multiTenantPattern ?? 'per-tenant';
  const multiTenantPattern = (VALID_MULTI_TENANT_PATTERNS as readonly string[]).includes(rawPattern)
    ? (rawPattern as (typeof VALID_MULTI_TENANT_PATTERNS)[number])
    : 'per-tenant';

  const primary = raw.recommendation?.primary;
  return {
    constraint: {
      allowed,
      enforced: raw.constraint?.enforced ?? true,
    },
    recommendation: {
      primary: primary && VALID_NAMESPACE_TYPES.has(primary as NamespaceType) ? (primary as NamespaceType) : 'custom',
      alternatives: raw.recommendation?.alternatives
        ?.filter((a): a is { namespace_type: string; use_case?: string } => typeof a?.namespace_type === 'string')
        .map((a) => ({ namespace_type: a.namespace_type as NamespaceType, use_case: a.use_case ?? '' })),
      rationale: raw.recommendation?.rationale ?? '',
    },
    classification: {
      category: raw.classification?.category ?? 'application',
      multiTenantPattern,
    },
  };
}

/**
 * Load the authoritative namespace_profiles.json map. Throws if the file is
 * missing, unparseable, or lacks a `default` profile — there is no fallback.
 */
export function loadNamespaceProfiles(jsonPath: string): NamespaceProfilesMap {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Required namespace_profiles.json not found at: ${jsonPath}`);
  }

  let raw: { default?: RawNamespaceProfile; resources?: Record<string, RawNamespaceProfile> };
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
      default?: RawNamespaceProfile;
      resources?: Record<string, RawNamespaceProfile>;
    };
  } catch (e) {
    throw new Error(`Failed to parse namespace_profiles.json at ${jsonPath}`, { cause: e });
  }

  if (!raw.default) {
    throw new Error(`namespace_profiles.json at ${jsonPath} is missing the required "default" profile`);
  }

  const resources: Record<string, NamespaceProfile> = {};
  for (const [key, profile] of Object.entries(raw.resources ?? {})) {
    resources[key] = normalizeProfile(profile);
  }

  return { default: normalizeProfile(raw.default), resources };
}

/**
 * Resolve the authoritative profile for a resource key: explicit override if
 * present, otherwise the map's default profile.
 */
export function resolveNamespaceProfile(map: NamespaceProfilesMap, resourceKey: string): NamespaceProfile {
  return map.resources[resourceKey] ?? map.default;
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
 * Parsed information from an OpenAPI spec file
 */
export interface ParsedSpecInfo {
  /** Resource key (e.g., 'http_loadbalancer') */
  resourceKey: string;
  /** API path suffix (e.g., 'http_loadbalancers') */
  apiPath: string;
  /** Display name for UI (e.g., 'HTTP Load Balancers') */
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
  /**
   * Namespace profile - the authoritative resource→namespace scope.
   * Assigned by the generator from the namespace_profiles.json map (single
   * source of truth); not derived during parsing.
   */
  namespaceProfile?: NamespaceProfile;
  /** Documentation URL if available */
  documentationUrl?: string;
  /** Domain from x-f5xc-cli-domain extension (e.g., 'waf', 'virtual', 'dns') */
  domain?: string;
  /** Operation metadata extracted from x-f5xc-operation-metadata extensions */
  operationMetadata?: ResourceOperationMetadata;
  /** Field metadata for server defaults and required fields */
  fieldMetadata?: ResourceFieldMetadata;
  /** Domain-level best practices (from x-f5xc-best-practices in spec info) */
  bestPractices?: BestPracticesInfo;
  /** Guided workflows (from x-f5xc-guided-workflows in spec info) */
  guidedWorkflows?: unknown[];
}

/**
 * Required-for configuration indicating when a field is required.
 * From upstream x-f5xc-required-for extension.
 */
export interface FieldRequiredFor {
  /** Required for minimum configuration */
  minimum_config?: boolean;
  /** Required for create operation (user must provide) */
  create?: boolean;
  /** Required for update operation */
  update?: boolean;
}

/**
 * Metadata for a single field in a resource schema.
 * Extracted from components.schemas in OpenAPI specs.
 */
export interface FieldMetadata {
  /** Dot-separated path to the field (e.g., 'spec.monitoring') */
  path: string;
  /** Server-provided default value for this field */
  default?: unknown;
  /** Whether server applies a default for this field (from x-f5xc-server-default) */
  serverDefault?: boolean;
  /** When this field is required (from x-f5xc-required-for) */
  requiredFor?: FieldRequiredFor;
  /** Recommended value for this field (from x-f5xc-recommended-value) */
  recommendedValue?: unknown;
  /** Field description */
  description?: string;
  /** Field type */
  type?: string;
  /** Short description (from x-f5xc-description-short) */
  descriptionShort?: string;
  /** Medium description (from x-f5xc-description-medium) */
  descriptionMedium?: string;
  /** Example value (from x-f5xc-example) */
  example?: unknown;
  /** Validation constraints (from x-f5xc-constraints) */
  constraints?: ConstraintInfo;
  /** Fields this field conflicts with (from x-f5xc-conflicts-with) */
  conflictsWith?: string[];
  /** Whether this field is required for minimum configuration (from x-f5xc-minimum-configuration) */
  isMinimumConfig?: boolean;
  /** Recommended oneof variant (from x-f5xc-recommended-oneof-variant) */
  recommendedOneofVariant?: string;
  /** Enum values from OpenAPI spec (multi-value enums only) */
  enumValues?: unknown[];
}

/**
 * Complete field metadata for a resource type.
 * Provides information about server defaults and user requirements.
 */
export interface ResourceFieldMetadata {
  /** Map of field paths to their metadata */
  fields: Record<string, FieldMetadata>;
  /** List of field paths that have server defaults */
  serverDefaultFields: string[];
  /** List of field paths that user must provide at creation */
  userRequiredFields: string[];
  /** List of field paths that have recommended values */
  recommendedValueFields?: string[];
  /** List of field paths marked as minimum configuration */
  minimumConfigFields: string[];
  /** List of field paths that have validation constraints */
  constrainedFields: string[];
}

/**
 * Field validation constraints from x-f5xc-constraints extension.
 */
export interface ConstraintInfo {
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
}

/**
 * Domain-level best practices from x-f5xc-best-practices extension.
 */
export interface BestPracticesInfo {
  commonErrors?: Array<{
    code: number;
    message: string;
    resolution: string;
    prevention?: string;
  }>;
  securityNotes?: string[];
  performanceTips?: string[];
}

/**
 * Schema object structure from components.schemas
 */
export interface SchemaObject {
  type?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  allOf?: SchemaObject[];
  $ref?: string;
  enum?: unknown[];
}

/**
 * Schema property with F5 XC extensions
 */
interface SchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  'x-f5xc-server-default'?: boolean;
  'x-f5xc-required-for'?: {
    minimum_config?: boolean;
    create?: boolean;
    update?: boolean;
    read?: boolean;
  };
  'x-f5xc-recommended-value'?: unknown;
  'x-ves-required'?: string;
  'x-f5xc-description-short'?: string;
  'x-f5xc-description-medium'?: string;
  'x-f5xc-example'?: unknown;
  'x-f5xc-constraints'?: Record<string, unknown>;
  'x-f5xc-minimum-configuration'?: boolean;
  'x-f5xc-conflicts-with'?: string[];
  'x-f5xc-recommended-oneof-variant'?: string;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  $ref?: string;
}

/**
 * OpenAPI spec structure (minimal interface for what we need)
 */
interface OpenAPISpec {
  info?: {
    title?: string;
    description?: string;
    'x-f5xc-api-reference-url'?: string;
    'x-f5xc-cli-domain'?: string;
    'x-f5xc-best-practices'?: {
      common_errors?: Array<{
        code: number;
        message: string;
        resolution: string;
        prevention?: string;
      }>;
      security_notes?: string[];
      performance_tips?: string[];
    };
    'x-f5xc-guided-workflows'?: unknown[];
  };
  paths?: Record<string, PathItem>;
  externalDocs?: {
    url?: string;
  };
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

interface PathItem {
  'x-displayname'?: string;
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
}

/**
 * Raw operation metadata from OpenAPI spec x-f5xc-operation-metadata extension
 */
interface RawOperationMetadata {
  purpose?: string;
  danger_level?: string;
  confirmation_required?: boolean;
  required_fields?: string[];
  optional_fields?: string[];
  conditions?: {
    prerequisites?: string[];
    postconditions?: string[];
  };
  side_effects?: {
    creates?: string[];
    updates?: string[];
    deletes?: string[];
    invalidates?: string[];
  };
  common_errors?: Array<{
    code: number;
    message: string;
    solution: string;
  }>;
  performance_impact?: {
    latency?: string;
    resource_usage?: string;
  };
}

interface Operation {
  operationId?: string;
  description?: string;
  externalDocs?: {
    url?: string;
  };
  'x-f5xc-operation-metadata'?: RawOperationMetadata;
  'x-f5xc-danger-level'?: string;
  'x-f5xc-discovered-response-time'?: string | Record<string, unknown>;
  'x-f5xc-required-fields'?: string[];
  'x-f5xc-requires'?: string[];
}

// ============================================================================
// Domain-based parsing functions for new merged spec format
// ============================================================================

/**
 * Derive resource key from API path suffix.
 * Example: "http_loadbalancers" -> "http_loadbalancer"
 * Example: "app_firewalls" -> "app_firewall"
 */
export function deriveResourceKeyFromApiPath(apiPath: string): string {
  // Remove trailing 's' for singular form
  if (apiPath.endsWith('ies')) {
    // policies -> policy (F5 XC uses non-standard plural, so this may not apply)
    return `${apiPath.slice(0, -3)}y`;
  }
  if (apiPath.endsWith('ses')) {
    // classes -> class
    return apiPath.slice(0, -2);
  }
  if (apiPath.endsWith('s')) {
    return apiPath.slice(0, -1);
  }
  return apiPath;
}

/**
 * Derive schema ID from API path and operation ID.
 * Example: operationId "ves.io.schema.app_firewall.API.Create" -> "ves.io.schema.app_firewall"
 */
function deriveSchemaIdFromPath(apiPath: string, pathItem: PathItem): string {
  // Try to get operationId from any method
  for (const method of ['post', 'get', 'put', 'delete'] as const) {
    const operation = pathItem[method];
    if (operation?.operationId) {
      // Extract schema ID from operationId
      // "ves.io.schema.app_firewall.API.Create" -> "ves.io.schema.app_firewall"
      const match = operation.operationId.match(/^(ves\.io\.schema\.[^.]+(?:\.[^.]+)*?)\.API\./);
      if (match?.[1]) {
        return match[1];
      }
    }
  }
  // Fallback: construct from apiPath
  const resourceKey = deriveResourceKeyFromApiPath(apiPath);
  return `ves.io.schema.${resourceKey}`;
}

/**
 * Convert raw operation metadata from spec to normalized OperationMetadata
 */
function convertRawMetadata(raw: RawOperationMetadata | undefined): OperationMetadata | undefined {
  if (!raw) {
    return undefined;
  }

  const result: OperationMetadata = {};

  if (raw.purpose) {
    result.purpose = raw.purpose;
  }

  if (raw.danger_level) {
    const level = raw.danger_level.toLowerCase();
    if (level === 'low' || level === 'medium' || level === 'high') {
      result.dangerLevel = level;
    }
  }

  if (raw.confirmation_required !== undefined) {
    result.confirmationRequired = raw.confirmation_required;
  }

  if (raw.required_fields && raw.required_fields.length > 0) {
    result.requiredFields = raw.required_fields;
  }

  if (raw.optional_fields && raw.optional_fields.length > 0) {
    result.optionalFields = raw.optional_fields;
  }

  if (raw.conditions?.prerequisites && raw.conditions.prerequisites.length > 0) {
    result.prerequisites = raw.conditions.prerequisites;
  }

  if (raw.conditions?.postconditions && raw.conditions.postconditions.length > 0) {
    result.postconditions = raw.conditions.postconditions;
  }

  if (raw.side_effects) {
    const sideEffects: SideEffects = {};
    if (raw.side_effects.creates?.length) {
      sideEffects.creates = raw.side_effects.creates;
    }
    if (raw.side_effects.updates?.length) {
      sideEffects.updates = raw.side_effects.updates;
    }
    if (raw.side_effects.deletes?.length) {
      sideEffects.deletes = raw.side_effects.deletes;
    }
    if (raw.side_effects.invalidates?.length) {
      sideEffects.invalidates = raw.side_effects.invalidates;
    }
    if (Object.keys(sideEffects).length > 0) {
      result.sideEffects = sideEffects;
    }
  }

  if (raw.common_errors && raw.common_errors.length > 0) {
    result.commonErrors = raw.common_errors.map((e) => ({
      code: e.code,
      message: e.message,
      solution: e.solution,
    }));
  }

  if (raw.performance_impact) {
    const impact: PerformanceImpact = {
      latency: raw.performance_impact.latency || 'unknown',
      resourceUsage: raw.performance_impact.resource_usage || 'unknown',
    };
    result.performanceImpact = impact;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Extract operation metadata from a path item (including x-f5xc-danger-level fallback)
 */
function extractOperationMetadata(operation: Operation | undefined): OperationMetadata | undefined {
  if (!operation) {
    return undefined;
  }

  const metadata = convertRawMetadata(operation['x-f5xc-operation-metadata']);

  // Fallback to x-f5xc-danger-level if not in operation metadata
  if (metadata && !metadata.dangerLevel && operation['x-f5xc-danger-level']) {
    const level = operation['x-f5xc-danger-level'].toLowerCase();
    if (level === 'low' || level === 'medium' || level === 'high') {
      metadata.dangerLevel = level;
    }
  }

  const result = metadata ?? {};

  const rt = operation['x-f5xc-discovered-response-time'];
  if (typeof rt === 'string' && rt.length > 0) {
    result.discoveredResponseTime = rt;
  } else if (rt !== null && rt !== undefined && typeof rt === 'object') {
    // Strip time-varying fields (e.g., last_measured) for deterministic output
    const rtCopy = { ...rt };
    delete rtCopy.last_measured;
    result.discoveredResponseTime = JSON.stringify(rtCopy);
  }

  const reqFields = operation['x-f5xc-required-fields'];
  if (Array.isArray(reqFields) && reqFields.length > 0) {
    result.operationRequiredFields = reqFields.filter((v): v is string => typeof v === 'string');
  }

  const requires = operation['x-f5xc-requires'];
  if (Array.isArray(requires) && requires.length > 0) {
    result.requires = requires.filter((v): v is string => typeof v === 'string');
  }

  return Object.keys(result).length === 0 ? undefined : result;
}

// ============================================================================
// Field Metadata Extraction Functions
// ============================================================================

/**
 * Check if a default value is empty/meaningless and should be ignored.
 * Empty defaults include: null, undefined, empty objects, empty arrays.
 *
 * @param value - The value to check
 * @returns true if the value is empty/meaningless
 */
function isEmptyDefault(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return Object.keys(value).length === 0;
  }
  return false;
}

/**
 * Extract field metadata from a schema property recursively.
 *
 * @param property - The schema property to process
 * @param basePath - The current path prefix (e.g., 'spec.monitoring')
 * @param metadata - The map to store extracted metadata
 * @param schemas - All schemas for resolving $ref
 */
function extractFieldMetadataFromProperty(
  property: SchemaObject | Record<string, unknown>,
  basePath: string,
  metadata: Record<string, FieldMetadata>,
  schemas: Record<string, SchemaObject>,
): void {
  const prop = property as {
    type?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    'x-f5xc-server-default'?: boolean;
    'x-f5xc-required-for'?: {
      minimum_config?: boolean;
      create?: boolean;
      update?: boolean;
      read?: boolean;
    };
    'x-f5xc-recommended-value'?: unknown;
    'x-ves-required'?: string;
    'x-f5xc-description-short'?: string;
    'x-f5xc-description-medium'?: string;
    'x-f5xc-example'?: unknown;
    'x-f5xc-constraints'?: Record<string, unknown>;
    'x-f5xc-minimum-configuration'?: boolean;
    'x-f5xc-conflicts-with'?: string[];
    'x-f5xc-recommended-oneof-variant'?: string;
    properties?: Record<string, unknown>;
    items?: Record<string, unknown>;
    $ref?: string;
  };

  // IMPORTANT: Check metadata BEFORE handling $ref
  // Some properties have both a $ref AND metadata (e.g., x-f5xc-server-default, default)
  // Example: endpoint_selection has $ref to clusterEndpointSelectionPolicy AND default: "DISTRIBUTED"
  // Check if this property has meaningful metadata
  const hasDefault = prop.default !== undefined;
  const hasServerDefault = prop['x-f5xc-server-default'] === true;
  const hasRequiredFor = prop['x-f5xc-required-for'] !== undefined;
  const hasRecommendedValue = prop['x-f5xc-recommended-value'] !== undefined;
  const hasSingleEnum = prop.enum && Array.isArray(prop.enum) && prop.enum.length === 1;
  const hasMultiEnum = Array.isArray(prop.enum) && prop.enum.length > 1;

  // New extension flags
  const hasDescShort = prop['x-f5xc-description-short'] !== undefined;
  const hasDescMedium = prop['x-f5xc-description-medium'] !== undefined;
  const hasExample = prop['x-f5xc-example'] !== undefined;
  const hasConstraints = prop['x-f5xc-constraints'] !== undefined;
  const hasMinConfig = prop['x-f5xc-minimum-configuration'] === true;
  const hasConflicts = Array.isArray(prop['x-f5xc-conflicts-with']) && prop['x-f5xc-conflicts-with'].length > 0;
  const hasRecOneof = prop['x-f5xc-recommended-oneof-variant'] !== undefined;

  // Determine effective recommended value with priority
  let effectiveRecommendedValue: unknown;

  if (hasRecommendedValue) {
    // Priority 1: Explicit recommended value (highest priority)
    effectiveRecommendedValue = prop['x-f5xc-recommended-value'];
  } else if (hasDefault && !isEmptyDefault(prop.default)) {
    // Priority 2: Non-empty default value
    effectiveRecommendedValue = prop.default;
  } else if (hasSingleEnum && prop.enum) {
    // Priority 3: Single enum value (implicit default)
    effectiveRecommendedValue = prop.enum[0];
  }

  if (
    hasDefault ||
    hasServerDefault ||
    hasRequiredFor ||
    effectiveRecommendedValue !== undefined ||
    hasDescShort ||
    hasDescMedium ||
    hasExample ||
    hasConstraints ||
    hasMinConfig ||
    hasConflicts ||
    hasRecOneof ||
    hasMultiEnum
  ) {
    const fieldMeta: FieldMetadata = {
      path: basePath,
    };

    if (hasDefault) {
      fieldMeta.default = prop.default;
    }

    if (hasServerDefault) {
      fieldMeta.serverDefault = true;
    }

    if (hasRequiredFor) {
      const reqFor = prop['x-f5xc-required-for'];
      if (reqFor) {
        fieldMeta.requiredFor = {
          minimum_config: reqFor.minimum_config,
          create: reqFor.create,
          update: reqFor.update,
        };
      }
    }

    if (effectiveRecommendedValue !== undefined) {
      fieldMeta.recommendedValue = effectiveRecommendedValue;
    }

    if (prop.description) {
      fieldMeta.description = prop.description;
    }

    if (prop.type) {
      fieldMeta.type = prop.type;
    }

    // Task 4: Short and medium descriptions
    if (hasDescShort) {
      fieldMeta.descriptionShort = prop['x-f5xc-description-short'];
    }
    if (hasDescMedium) {
      fieldMeta.descriptionMedium = prop['x-f5xc-description-medium'];
    }

    // Task 5: Example value
    if (hasExample) {
      fieldMeta.example = prop['x-f5xc-example'];
    }

    // Task 6: Constraints
    const rawC = prop['x-f5xc-constraints'];
    if (rawC && typeof rawC === 'object') {
      const c = rawC;
      const ci: ConstraintInfo = {};
      if (typeof c.constraintType === 'string') {
        ci.constraintType = c.constraintType;
      }
      if (typeof c.category === 'string') {
        ci.category = c.category;
      }
      if (typeof c.maxLength === 'number') {
        ci.maxLength = c.maxLength;
      }
      if (typeof c.minLength === 'number') {
        ci.minLength = c.minLength;
      }
      if (typeof c.pattern === 'string') {
        ci.pattern = c.pattern;
      }
      if (typeof c.format === 'string') {
        ci.format = c.format;
      }
      if (typeof c.formatDescription === 'string') {
        ci.formatDescription = c.formatDescription;
      }
      if (typeof c.deterministic === 'boolean') {
        ci.deterministic = c.deterministic;
      }
      if (typeof c.minimum === 'number') {
        ci.minimum = c.minimum;
      }
      if (typeof c.maximum === 'number') {
        ci.maximum = c.maximum;
      }
      if (typeof c.multipleOf === 'number') {
        ci.multipleOf = c.multipleOf;
      }
      if (c.characterSet && typeof c.characterSet === 'object') {
        const cs = c.characterSet as Record<string, unknown>;
        ci.characterSet = {
          allowed: typeof cs.allowed === 'string' ? cs.allowed : undefined,
          restricted: typeof cs.restricted === 'string' ? cs.restricted : undefined,
          description: typeof cs.description === 'string' ? cs.description : undefined,
        };
      }
      if (Object.keys(ci).length > 0) {
        fieldMeta.constraints = ci;
      }
    }

    // Task 7: Minimum config, conflicts with, recommended oneof variant
    if (hasMinConfig) {
      fieldMeta.isMinimumConfig = true;
    }

    if (hasConflicts) {
      const cw = prop['x-f5xc-conflicts-with'];
      if (Array.isArray(cw) && cw.length > 0) {
        fieldMeta.conflictsWith = cw.filter((v): v is string => typeof v === 'string');
      }
    }

    if (typeof prop['x-f5xc-recommended-oneof-variant'] === 'string') {
      fieldMeta.recommendedOneofVariant = prop['x-f5xc-recommended-oneof-variant'];
    }

    if (Array.isArray(prop.enum) && prop.enum.length > 1) {
      fieldMeta.enumValues = prop.enum;
    }

    metadata[basePath] = fieldMeta;
  } else if (basePath && (prop.type || prop.description)) {
    metadata[basePath] = {
      path: basePath,
      type: prop.type,
      description: prop.description,
    };
  }

  // Handle $ref by resolving to actual schema for nested properties
  // This is done AFTER extracting metadata from the current property
  if (prop.$ref) {
    const refName = prop.$ref.replace('#/components/schemas/', '');
    const refSchema = schemas[refName];
    if (refSchema?.properties) {
      for (const [propName, propValue] of Object.entries(refSchema.properties)) {
        const childPath = basePath ? `${basePath}.${propName}` : propName;
        extractFieldMetadataFromProperty(propValue, childPath, metadata, schemas);
      }
    }
    // Capture enum values from referenced enum schemas
    if (refSchema && Array.isArray(refSchema.enum) && refSchema.enum.length > 1) {
      if (!metadata[basePath]) {
        metadata[basePath] = { path: basePath };
      }
      metadata[basePath].enumValues = refSchema.enum;
    }
    // Don't return early - continue to check for nested properties
  }

  // Recurse into nested properties
  if (prop.properties) {
    for (const [propName, propValue] of Object.entries(prop.properties)) {
      const childPath = basePath ? `${basePath}.${propName}` : propName;

      extractFieldMetadataFromProperty(propValue as SchemaObject, childPath, metadata, schemas);
    }
  }

  // Handle array items
  if (prop.items) {
    extractFieldMetadataFromProperty(prop.items, `${basePath}[]`, metadata, schemas);
  }

  // Handle allOf composition — recurse into each allOf item with same basePath
  const rawAllOf = (property as Record<string, unknown>).allOf;
  if (Array.isArray(rawAllOf)) {
    for (const allOfItem of rawAllOf) {
      if (allOfItem && typeof allOfItem === 'object') {
        extractFieldMetadataFromProperty(allOfItem as Record<string, unknown>, basePath, metadata, schemas);
      }
    }
  }
}

/**
 * Extract field metadata from a schema, walking through its properties.
 *
 * @param schema - The schema object to process
 * @param basePath - Base path prefix for all fields
 * @param metadata - Map to store extracted metadata
 * @param schemas - All schemas for resolving $ref
 */
function extractFieldMetadataFromSchema(
  schema: SchemaObject,
  basePath: string,
  metadata: Record<string, FieldMetadata>,
  schemas: Record<string, SchemaObject>,
): void {
  if (schema.properties) {
    for (const [propName, propValue] of Object.entries(schema.properties)) {
      const fieldPath = basePath ? `${basePath}.${propName}` : propName;
      extractFieldMetadataFromProperty(propValue, fieldPath, metadata, schemas);
    }
  }

  // Handle allOf (schema composition)
  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      if (subSchema.$ref) {
        const refName = subSchema.$ref.replace('#/components/schemas/', '');
        const refSchema = schemas[refName];
        if (refSchema) {
          extractFieldMetadataFromSchema(refSchema, basePath, metadata, schemas);
        }
      } else {
        extractFieldMetadataFromSchema(subSchema, basePath, metadata, schemas);
      }
    }
  }
}

/**
 * Find the CreateSpecType or SpecType schema for a resource.
 * Schema naming patterns:
 * - {resource}CreateSpecType (e.g., app_firewallCreateSpecType)
 * - {resource}SpecType
 *
 * @param schemas - All component schemas
 * @param resourceKey - The resource key (e.g., 'app_firewall')
 * @returns The schema name if found
 */
function findCreateSpecSchemaName(schemas: Record<string, SchemaObject>, resourceKey: string): string | undefined {
  const suffixes = ['CreateSpecType', 'ReplaceSpecType', 'GetSpecType', 'GlobalSpecType', 'SpecType'];
  const keyLower = resourceKey.toLowerCase();

  for (const suffix of suffixes) {
    let bestMatch: string | undefined;
    let bestPropertyCount = -1;

    for (const schemaName of Object.keys(schemas)) {
      if (!schemaName.endsWith(suffix)) {
        continue;
      }

      const base = schemaName.slice(0, -suffix.length).toLowerCase();
      if (base === keyLower || base.endsWith(keyLower)) {
        const schema = schemas[schemaName];
        const propCount = schema?.properties ? Object.keys(schema.properties).length : 0;
        if (propCount > bestPropertyCount) {
          bestPropertyCount = propCount;
          bestMatch = schemaName;
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }
  }

  return undefined;
}

/**
 * Extract resource field metadata from OpenAPI spec's components.schemas.
 *
 * @param spec - The OpenAPI spec
 * @param resourceKey - The resource key (e.g., 'app_firewall')
 * @returns Resource field metadata or undefined if not available
 */
export function extractResourceFieldMetadata(
  spec: OpenAPISpec,
  resourceKey: string,
): ResourceFieldMetadata | undefined {
  const schemas = spec.components?.schemas;
  if (!schemas) {
    return undefined;
  }

  const schemaName = findCreateSpecSchemaName(schemas, resourceKey);
  if (!schemaName) {
    return undefined;
  }

  const schema = schemas[schemaName];
  if (!schema) {
    return undefined;
  }

  const fields: Record<string, FieldMetadata> = {};

  // Extract field metadata starting at 'spec' level (as that's how CreateSpecType works)
  extractFieldMetadataFromSchema(schema, 'spec', fields, schemas);

  // Calculate derived arrays
  const serverDefaultFields: string[] = [];
  const userRequiredFields: string[] = [];
  const recommendedValueFields: string[] = [];
  const minimumConfigFields: string[] = [];
  const constrainedFields: string[] = [];

  for (const [path, meta] of Object.entries(fields)) {
    // Fields with server defaults
    if (meta.serverDefault || meta.default !== undefined) {
      serverDefaultFields.push(path);
    }

    // Fields user must provide at creation
    // Required if: x-f5xc-required-for.create is true AND no server default
    const reqFor = meta.requiredFor;
    if (reqFor?.create === true && !meta.serverDefault && meta.default === undefined) {
      userRequiredFields.push(path);
    }

    // Fields with recommended values
    if (meta.recommendedValue !== undefined) {
      recommendedValueFields.push(path);
    }

    // Fields marked as minimum configuration
    if (meta.isMinimumConfig === true) {
      minimumConfigFields.push(path);
    }

    // Fields with validation constraints
    if (meta.constraints !== undefined) {
      constrainedFields.push(path);
    }
  }

  // Only return if we found meaningful metadata
  if (Object.keys(fields).length === 0) {
    return undefined;
  }

  const result: ResourceFieldMetadata = {
    fields,
    serverDefaultFields: serverDefaultFields.sort(),
    userRequiredFields: userRequiredFields.sort(),
    minimumConfigFields: minimumConfigFields.sort(),
    constrainedFields: constrainedFields.sort(),
  };

  // Only include recommendedValueFields if we have any
  if (recommendedValueFields.length > 0) {
    result.recommendedValueFields = recommendedValueFields.sort();
  }

  return result;
}

/**
 * Parse a domain file and extract all resource types.
 * Domain files contain multiple resource types grouped by domain.
 */
export function parseDomainFile(filePath: string): ParsedSpecInfo[] {
  const filename = path.basename(filePath);
  const results: ParsedSpecInfo[] = [];

  let spec: OpenAPISpec;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    spec = JSON.parse(content) as OpenAPISpec;
  } catch (e) {
    console.error(`Error parsing domain file ${filename}:`, e);
    return [];
  }

  const domain = spec.info?.['x-f5xc-cli-domain'];

  // Clean break: Require x-f5xc-cli-domain field - skip legacy files
  if (!domain) {
    console.warn(`SKIP: ${filename} missing required x-f5xc-cli-domain field`);
    return [];
  }

  const paths = spec.paths;

  if (!paths) {
    return [];
  }

  // Pattern for list endpoints (plural resource path)
  // Matches: /api/config/namespaces/{metadata.namespace}/http_loadbalancers
  // Also matches extended paths: /api/config/dns/namespaces/{ns}/dns_zones
  const listEndpointPattern = /^\/api\/([a-z_-]+)(?:\/([a-z_]+))?\/namespaces\/(?:\{[^}]+\}|system|shared)\/([a-z_]+)$/;

  const seen = new Set<string>();

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    const match = pathKey.match(listEndpointPattern);
    if (!match) {
      continue;
    }

    const apiBase = match[1];
    const serviceSegment = match[2]; // May be undefined
    const apiPath = match[3];

    // Skip if required parts are missing
    if (!apiBase || !apiPath) {
      continue;
    }

    // Skip if this is an item endpoint (ends with /{name})
    if (pathKey.endsWith('}')) {
      continue;
    }

    const resourceKey = deriveResourceKeyFromApiPath(apiPath);

    // Handle duplicates: prefer entry with richer field metadata
    if (seen.has(resourceKey)) {
      const existingIdx = results.findIndex((r) => r.resourceKey === resourceKey);
      if (existingIdx >= 0) {
        const existing = results[existingIdx]!;
        const existingFields = existing.fieldMetadata ? Object.keys(existing.fieldMetadata.fields).length : 0;
        const candidateFields = extractResourceFieldMetadata(spec, resourceKey);
        const candidateCount = candidateFields ? Object.keys(candidateFields.fields).length : 0;
        if (candidateCount > existingFields && candidateFields) {
          results[existingIdx] = { ...existing, fieldMetadata: candidateFields };
        }
      }
      continue;
    }
    seen.add(resourceKey);

    // Get display name from x-displayname extension
    const displayNameRaw = pathItem['x-displayname'] || resourceKey;
    // Clean up display name (remove trailing period, add 's' for plural)
    let displayName = displayNameRaw.replace(/\.$/, '');
    if (!displayName.endsWith('s') && !displayName.endsWith('ing')) {
      displayName += 's';
    }

    // Get description from first operation
    let description = '';
    for (const method of ['get', 'post'] as const) {
      const operation = pathItem[method];
      if (operation?.description) {
        description = normalizeDescription(operation.description);
        break;
      }
    }

    // Build full API path
    const fullApiPath = pathKey;

    // Derive schema ID
    const schemaId = deriveSchemaIdFromPath(apiPath, pathItem);

    // Extract operation metadata from list endpoint (GET=list, POST=create)
    // and item endpoint (GET=get, PUT=update, DELETE=delete)
    const operationMetadata: ResourceOperationMetadata = {};

    // List endpoint operations
    const listOp = extractOperationMetadata(pathItem.get);
    if (listOp) {
      operationMetadata.list = listOp;
    }

    const createOp = extractOperationMetadata(pathItem.post);
    if (createOp) {
      operationMetadata.create = createOp;
    }

    // Look for item endpoint (pathKey + /{name})
    const itemPathKey = `${pathKey}/{name}`;
    const itemPathItem = paths[itemPathKey];
    if (itemPathItem) {
      const getOp = extractOperationMetadata(itemPathItem.get);
      if (getOp) {
        operationMetadata.get = getOp;
      }

      const updateOp = extractOperationMetadata(itemPathItem.put);
      if (updateOp) {
        operationMetadata.update = updateOp;
      }

      const deleteOp = extractOperationMetadata(itemPathItem.delete);
      if (deleteOp) {
        operationMetadata.delete = deleteOp;
      }
    }

    // Extract field metadata from components.schemas
    const fieldMetadata = extractResourceFieldMetadata(spec, resourceKey);

    const result: ParsedSpecInfo = {
      resourceKey,
      apiPath,
      displayName,
      description,
      apiBase,
      serviceSegment,
      fullApiPath,
      schemaFile: filename,
      schemaId,
      namespaceScoped: true,
      domain,
    };

    // Only include operationMetadata if we have at least one operation
    if (Object.keys(operationMetadata).length > 0) {
      result.operationMetadata = operationMetadata;
    }

    // Only include fieldMetadata if we have meaningful data
    if (fieldMetadata) {
      result.fieldMetadata = fieldMetadata;
    }

    // Extract guided workflows from spec info
    const rawGW = spec.info?.['x-f5xc-guided-workflows'];
    if (Array.isArray(rawGW) && rawGW.length > 0) {
      result.guidedWorkflows = rawGW;
    }

    // Extract domain-level best practices from spec info
    const rawBP = spec.info?.['x-f5xc-best-practices'];
    if (rawBP && typeof rawBP === 'object') {
      const bp: BestPracticesInfo = {};
      if (Array.isArray(rawBP.common_errors) && rawBP.common_errors.length > 0) {
        bp.commonErrors = rawBP.common_errors.map((e) => ({
          code: e.code,
          message: e.message,
          resolution: e.resolution,
          prevention: e.prevention,
        }));
      }
      if (Array.isArray(rawBP.security_notes) && rawBP.security_notes.length > 0) {
        bp.securityNotes = rawBP.security_notes;
      }
      if (Array.isArray(rawBP.performance_tips) && rawBP.performance_tips.length > 0) {
        bp.performanceTips = rawBP.performance_tips;
      }
      if (Object.keys(bp).length > 0) {
        result.bestPractices = bp;
      }
    }

    results.push(result);
  }

  return results;
}

// ============================================================================
// Validation data loading functions
// ============================================================================

/**
 * A single resource entry in validation.json required_fields.resources.
 * Contains arrays of field paths required for create and minimum_config.
 */
export interface ValidationResourceEntry {
  create?: string[];
  minimum_config?: string[];
}

/**
 * Shape of the validation.json file used to override fieldMetadata during generation.
 */
export interface ValidationData {
  required_fields: {
    resources: Record<string, ValidationResourceEntry>;
  };
}

/**
 * Load and parse validation.json from the given path.
 * Returns null if the file does not exist, cannot be read, or is malformed.
 *
 * @param validationPath - Absolute path to the validation.json file
 * @returns Parsed ValidationData or null on any error
 */
export function loadValidationData(validationPath: string): ValidationData | null {
  try {
    if (!fs.existsSync(validationPath)) {
      return null;
    }
    const content = fs.readFileSync(validationPath, 'utf-8');
    const data = JSON.parse(content) as ValidationData;
    if (!data.required_fields?.resources) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Parse all domain files in a directory.
 * Domain files contain merged specs grouped by F5 XC domain (waf, virtual, dns, etc.)
 */
export function parseAllDomainFiles(domainDir: string): ParsedSpecInfo[] {
  if (!fs.existsSync(domainDir)) {
    console.error(`Domain directory not found: ${domainDir}`);
    return [];
  }

  // Sort domain files alphabetically for deterministic processing order
  const domainFiles = fs
    .readdirSync(domainDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  console.log(`Found ${domainFiles.length} domain files`);

  const results: ParsedSpecInfo[] = [];
  const seen = new Set<string>();

  for (const filename of domainFiles) {
    const filePath = path.join(domainDir, filename);
    const domainResults = parseDomainFile(filePath);

    for (const info of domainResults) {
      if (!seen.has(info.resourceKey)) {
        seen.add(info.resourceKey);
        results.push(info);
      } else {
        const existingIdx = results.findIndex((r) => r.resourceKey === info.resourceKey);
        if (existingIdx >= 0) {
          const existing = results[existingIdx]!;
          const existingFieldCount = existing.fieldMetadata ? Object.keys(existing.fieldMetadata.fields).length : 0;
          const candidateFieldCount = info.fieldMetadata ? Object.keys(info.fieldMetadata.fields).length : 0;
          if (candidateFieldCount > existingFieldCount) {
            results[existingIdx] = { ...existing, fieldMetadata: info.fieldMetadata };
          }
        }
      }
    }
  }

  console.log(`Successfully parsed ${results.length} unique resource types from domain files`);
  return results;
}
