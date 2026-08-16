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
  version: string;
  default: NamespaceProfile;
  resources: Record<string, NamespaceProfile>;
}

export interface GeneratedResourceCoverage {
  disposition: 'generated';
  path: string;
  operationId: string;
}

export interface ManualResourceCoverage {
  disposition: 'manual';
  path: string;
}

export interface ExcludedResourceCoverage {
  disposition: 'excluded';
  reason: 'no_canonical_create';
}

export type ResourceCoverageRecord = GeneratedResourceCoverage | ManualResourceCoverage | ExcludedResourceCoverage;

/** Versioned upstream contract controlling which resources may be generated. */
export interface ResourceCoverageMap {
  version: string;
  contractVersion: 1;
  resources: Record<string, ResourceCoverageRecord>;
}

function isCanonicalCollectionPath(apiPath: string, resourceKey: string): boolean {
  const segments = apiPath.split('/').filter(Boolean);
  if (segments.length < 3 || segments[0] !== 'api') {
    return false;
  }
  const namespacesIndex = segments.lastIndexOf('namespaces');
  if (namespacesIndex < 0) {
    return false;
  }
  if (namespacesIndex === segments.length - 1) {
    return resourceKey === 'namespace';
  }
  return (
    segments.length === namespacesIndex + 3 &&
    Boolean(segments[namespacesIndex + 1]) &&
    Boolean(segments[namespacesIndex + 2]) &&
    !segments[namespacesIndex + 2]?.startsWith('{')
  );
}

/** Load and strictly validate resource_coverage.json. */
export function loadResourceCoverage(jsonPath: string, expectedVersion?: string): ResourceCoverageMap {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Required resource_coverage.json not found at: ${jsonPath}`);
  }

  let raw: {
    version?: unknown;
    contract_version?: unknown;
    resources?: unknown;
  };
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as typeof raw;
  } catch (error) {
    throw new Error(`Failed to parse resource_coverage.json at ${jsonPath}`, { cause: error });
  }

  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error(`resource_coverage.json at ${jsonPath} has no valid version`);
  }
  if (expectedVersion && raw.version !== expectedVersion) {
    throw new Error(`resource_coverage.json version ${raw.version} does not match ${expectedVersion}`);
  }
  if (raw.contract_version !== 1) {
    throw new Error(`resource_coverage.json at ${jsonPath} has unsupported contract_version`);
  }
  if (!raw.resources || typeof raw.resources !== 'object' || Array.isArray(raw.resources)) {
    throw new Error(`resource_coverage.json at ${jsonPath} has no valid resources object`);
  }

  const resources: Record<string, ResourceCoverageRecord> = {};
  const coveragePaths = new Set<string>();
  for (const resourceKey of Object.keys(raw.resources).sort()) {
    if (!/^[a-zA-Z0-9_]+$/.test(resourceKey)) {
      throw new Error(`resource_coverage.json has invalid resource key ${resourceKey}`);
    }
    const value = (raw.resources as Record<string, unknown>)[resourceKey];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`resource_coverage.json resource ${resourceKey} must be an object`);
    }
    const entry = value as Record<string, unknown>;
    if (entry.disposition === 'generated') {
      if (
        typeof entry.path !== 'string' ||
        !isCanonicalCollectionPath(entry.path, resourceKey) ||
        typeof entry.operation_id !== 'string'
      ) {
        throw new Error(`generated resource ${resourceKey} must declare path and operation_id`);
      }
      const identity = entry.operation_id.match(CANONICAL_CREATE_OPERATION)?.[1]?.split('.').at(-1);
      if (identity !== resourceKey) {
        throw new Error(`generated resource ${resourceKey} has mismatched operation identity`);
      }
      if (coveragePaths.has(entry.path)) {
        throw new Error(`coverage path ${entry.path} is assigned more than once`);
      }
      coveragePaths.add(entry.path);
      resources[resourceKey] = {
        disposition: 'generated',
        path: entry.path,
        operationId: entry.operation_id,
      };
    } else if (entry.disposition === 'manual') {
      if (typeof entry.path !== 'string' || !isCanonicalCollectionPath(entry.path, resourceKey)) {
        throw new Error(`manual resource ${resourceKey} must declare an API path`);
      }
      if (coveragePaths.has(entry.path)) {
        throw new Error(`coverage path ${entry.path} is assigned more than once`);
      }
      coveragePaths.add(entry.path);
      resources[resourceKey] = { disposition: 'manual', path: entry.path };
    } else if (entry.disposition === 'excluded') {
      if (entry.reason !== 'no_canonical_create') {
        throw new Error(`excluded resource ${resourceKey} has invalid exclusion reason`);
      }
      resources[resourceKey] = { disposition: 'excluded', reason: 'no_canonical_create' };
    } else {
      throw new Error(`resource ${resourceKey} has invalid coverage disposition`);
    }
  }

  return { version: raw.version, contractVersion: 1, resources };
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
  classification?: {
    category?: string;
    multi_tenant_pattern?: string;
    multiTenantPattern?: string;
  };
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
      // Advisory unless proven: a missing `enforced` flag means the upstream map
      // did not verify this constraint, so we must not over-restrict on a guess.
      // The authoritative map always sets this explicitly; this is a safety net.
      enforced: raw.constraint?.enforced ?? false,
    },
    recommendation: {
      primary: primary && VALID_NAMESPACE_TYPES.has(primary as NamespaceType) ? (primary as NamespaceType) : 'custom',
      alternatives: raw.recommendation?.alternatives
        ?.filter((a): a is { namespace_type: string; use_case?: string } => typeof a?.namespace_type === 'string')
        .map((a) => ({
          namespace_type: a.namespace_type as NamespaceType,
          use_case: a.use_case ?? '',
        })),
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
export function loadNamespaceProfiles(jsonPath: string, expectedVersion?: string): NamespaceProfilesMap {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Required namespace_profiles.json not found at: ${jsonPath}`);
  }

  let raw: {
    version?: string;
    default?: RawNamespaceProfile;
    resources?: Record<string, RawNamespaceProfile>;
  };
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
      version?: string;
      default?: RawNamespaceProfile;
      resources?: Record<string, RawNamespaceProfile>;
    };
  } catch (e) {
    throw new Error(`Failed to parse namespace_profiles.json at ${jsonPath}`, { cause: e });
  }

  if (!raw.default) {
    throw new Error(`namespace_profiles.json at ${jsonPath} is missing the required "default" profile`);
  }
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error(`namespace_profiles.json at ${jsonPath} is missing the required "version"`);
  }
  if (expectedVersion && raw.version !== expectedVersion) {
    throw new Error(`namespace_profiles.json version ${raw.version} does not match ${expectedVersion}`);
  }

  const resources: Record<string, NamespaceProfile> = {};
  for (const [key, profile] of Object.entries(raw.resources ?? {})) {
    resources[key] = normalizeProfile(profile);
  }

  return { version: raw.version, default: normalizeProfile(raw.default), resources };
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
  /** Read-only view layout (labelled, ordered fields from GetSpecType) for the describe panel */
  viewLayout?: ResourceViewLayout;
  /** Domain-level best practices (from x-f5xc-best-practices in spec info) */
  bestPractices?: BestPracticesInfo;
  /** Guided workflows (from x-f5xc-guided-workflows in spec info) */
  guidedWorkflows?: unknown[];
}

const CANONICAL_CREATE_OPERATION = /^ves\.io\.schema\.([a-zA-Z0-9_.]+)\.API\.Create$/;

/** Return the canonical resource key only when identity and route semantics agree. */
function canonicalCreateResourceKey(apiPath: string, pathItem: PathItem): string | undefined {
  const operationId = pathItem.post?.operationId;
  const match = operationId?.match(CANONICAL_CREATE_OPERATION);
  if (!match?.[1]) {
    return undefined;
  }

  const resourceKey = match[1].split('.').at(-1);
  if (!resourceKey) {
    return undefined;
  }
  const segments = apiPath.split('/').filter(Boolean);
  if (segments[0] !== 'api') {
    return undefined;
  }
  const namespacesIndex = segments.lastIndexOf('namespaces');
  if (namespacesIndex < 0) {
    return undefined;
  }
  if (namespacesIndex === segments.length - 1) {
    return resourceKey === 'namespace' ? resourceKey : undefined;
  }
  if (segments.length !== namespacesIndex + 3) {
    return undefined;
  }
  const namespaceSegment = segments[namespacesIndex + 1];
  const collectionSegment = segments[namespacesIndex + 2];
  if (!namespaceSegment || !collectionSegment || collectionSegment.startsWith('{')) {
    return undefined;
  }
  return resourceKey;
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
 * Derive schema ID from API path and operation ID.
 * Example: operationId "ves.io.schema.app_firewall.API.Create" -> "ves.io.schema.app_firewall"
 */
function deriveSchemaIdFromPath(resourceKey: string, pathItem: PathItem): string {
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
  // Contract already supplied the canonical resource identity.
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

// ─────────────────────────── View layout extraction ───────────────────────────
// The describe/view panel renders a resource read-only, grouped into labelled,
// ordered sections. Unlike the flat fieldMetadata (keyed off CreateSpecType for
// the form system), the view layout is built from GetSpecType — the superset that
// also carries read-only status fields (dns_info, host_name, cert_state, …) — and
// captures the display hints the console uses: x-displayname (label),
// x-ves-displayorder (order), x-field-mutability (read-only).

/** Maximum nesting depth captured in a view layout (bounds output size + recursion). */
const MAX_VIEW_LAYOUT_DEPTH = 3;

/** A single node in a resource's view layout tree. */
export interface ViewFieldNode {
  /** Raw spec property key (e.g. 'default_route_pools') */
  key: string;
  /** Human-readable label from x-displayname (trailing period stripped) */
  label?: string;
  /** Display order from x-ves-displayorder */
  order?: number;
  /** Structural kind of the field */
  kind: 'scalar' | 'object' | 'array';
  /** True when x-field-mutability is 'read-only' */
  readOnly?: boolean;
  /** Child fields (objects and array items), bounded by MAX_VIEW_LAYOUT_DEPTH */
  children?: ViewFieldNode[];
}

/** Ordered, labelled view layout for one resource type. */
export interface ResourceViewLayout {
  /** Top-level spec fields in display order */
  fields: ViewFieldNode[];
}

/** Minimal structural shape shared by SchemaObject and SchemaProperty for layout walking. */
interface SchemaLike {
  type?: string;
  $ref?: string;
  properties?: Record<string, SchemaLike>;
  allOf?: SchemaLike[];
  items?: SchemaLike;
  'x-displayname'?: string;
  'x-ves-displayorder'?: string | number;
  'x-field-mutability'?: string;
}

/** Strip a trailing period/whitespace from an x-displayname; return undefined if empty. */
function cleanViewLabel(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim().replace(/\.$/, '').trim();
  return trimmed || undefined;
}

/**
 * Find the schema that best represents the resource for a READ-ONLY view.
 * GetSpecType is preferred because it is the superset (includes status fields);
 * falls back through the other spec suffixes. Mirrors findCreateSpecSchemaName
 * but Get-first.
 */
function findViewSpecSchemaName(schemas: Record<string, SchemaLike>, resourceKey: string): string | undefined {
  const suffixes = ['GetSpecType', 'ReplaceSpecType', 'CreateSpecType', 'GlobalSpecType', 'SpecType'];
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

/** Merge a schema's own + $ref + allOf properties into a single map (cycle-guarded). */
function collectViewProperties(
  schema: SchemaLike,
  schemas: Record<string, SchemaLike>,
  seenRefs: Set<string>,
): Record<string, SchemaLike> {
  let out: Record<string, SchemaLike> = {};

  if (schema.$ref) {
    const name = schema.$ref.replace('#/components/schemas/', '');
    if (seenRefs.has(name)) {
      return out;
    }
    seenRefs.add(name);
    const ref = schemas[name];
    if (ref) {
      out = { ...out, ...collectViewProperties(ref, schemas, seenRefs) };
    }
    return out;
  }

  if (schema.properties) {
    out = { ...out, ...schema.properties };
  }
  if (schema.allOf) {
    for (const sub of schema.allOf) {
      out = { ...out, ...collectViewProperties(sub, schemas, seenRefs) };
    }
  }
  return out;
}

/** Resolve the child properties of an object/array-item property, if any. */
function resolveChildProperties(
  prop: SchemaLike,
  schemas: Record<string, SchemaLike>,
  seenRefs: Set<string>,
): Record<string, SchemaLike> | undefined {
  // Branch-local copy so the same schema may appear in sibling branches.
  const seen = new Set(seenRefs);
  if (prop.$ref || prop.properties || prop.allOf) {
    const props = collectViewProperties(prop, schemas, seen);
    return Object.keys(props).length > 0 ? props : undefined;
  }
  return undefined;
}

/** Build view nodes for a properties map, sorted by display order then key. */
function buildViewNodes(
  props: Record<string, SchemaLike>,
  schemas: Record<string, SchemaLike>,
  depth: number,
  seenRefs: Set<string>,
): ViewFieldNode[] {
  const nodes: ViewFieldNode[] = [];

  for (const [key, prop] of Object.entries(props)) {
    const label = cleanViewLabel(prop['x-displayname']);
    const orderRaw = prop['x-ves-displayorder'];
    const order = orderRaw !== undefined ? Number.parseInt(String(orderRaw), 10) : undefined;
    const readOnly = prop['x-field-mutability'] === 'read-only';

    let kind: ViewFieldNode['kind'] = 'scalar';
    let childSource: SchemaLike | undefined;
    if (prop.type === 'array' && prop.items) {
      kind = 'array';
      childSource = prop.items;
    } else if (prop.$ref || prop.properties || prop.allOf) {
      kind = 'object';
      childSource = prop;
    }

    const node: ViewFieldNode = { key, kind };
    if (label) {
      node.label = label;
    }
    if (order !== undefined && !Number.isNaN(order)) {
      node.order = order;
    }
    if (readOnly) {
      node.readOnly = true;
    }

    if (childSource && depth < MAX_VIEW_LAYOUT_DEPTH) {
      const childProps = resolveChildProperties(childSource, schemas, seenRefs);
      if (childProps) {
        const children = buildViewNodes(childProps, schemas, depth + 1, seenRefs);
        if (children.length > 0) {
          node.children = children;
        }
      }
    }

    nodes.push(node);
  }

  nodes.sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    return ao !== bo ? ao - bo : a.key.localeCompare(b.key);
  });

  return nodes;
}

/**
 * Build the read-only view layout for a resource from its GetSpecType schema.
 * Returns undefined when no suitable schema/fields are found.
 */
export function buildResourceViewLayout(spec: OpenAPISpec, resourceKey: string): ResourceViewLayout | undefined {
  const schemas = spec.components?.schemas;
  if (!schemas) {
    return undefined;
  }
  const schemaName = findViewSpecSchemaName(schemas, resourceKey);
  if (!schemaName) {
    return undefined;
  }
  const schema = schemas[schemaName];
  if (!schema) {
    return undefined;
  }

  const topProps = collectViewProperties(schema, schemas, new Set([schemaName]));
  const fields = buildViewNodes(topProps, schemas, 1, new Set([schemaName]));
  return fields.length > 0 ? { fields } : undefined;
}

/**
 * Parse a domain file and extract all resource types.
 * Domain files contain multiple resource types grouped by domain.
 */
export function parseDomainFile(filePath: string, coverage: ResourceCoverageMap): ParsedSpecInfo[] {
  const filename = path.basename(filePath);
  const results: ParsedSpecInfo[] = [];

  let spec: OpenAPISpec;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    spec = JSON.parse(content) as OpenAPISpec;
  } catch (e) {
    console.error('Error parsing domain file %s:', filename, e);
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

  const generatedByPath = new Map<string, [string, GeneratedResourceCoverage]>();
  for (const [resourceKey, record] of Object.entries(coverage.resources)) {
    if (record.disposition === 'generated') {
      generatedByPath.set(record.path, [resourceKey, record]);
    }
  }

  const seen = new Set<string>();

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    const canonicalResourceKey = canonicalCreateResourceKey(pathKey, pathItem);
    if (canonicalResourceKey) {
      const record = coverage.resources[canonicalResourceKey];
      if (record?.disposition !== 'generated') {
        throw new Error(`unclassified canonical resource ${canonicalResourceKey} at ${pathKey}`);
      }
      if (record.path !== pathKey) {
        throw new Error(
          `stale coverage path for canonical resource ${canonicalResourceKey}: expected ${record.path}, found ${pathKey}`,
        );
      }
      if (record.operationId !== pathItem.post?.operationId) {
        throw new Error(
          `resource coverage operation identity mismatch for ${canonicalResourceKey}: ` +
            `expected ${record.operationId}, found ${pathItem.post?.operationId ?? 'missing'}`,
        );
      }
    }

    const generated = generatedByPath.get(pathKey);
    if (!generated) {
      continue;
    }
    const [resourceKey, coverageRecord] = generated;
    if (pathItem.post?.operationId !== coverageRecord.operationId) {
      throw new Error(
        `resource coverage operation identity mismatch for ${resourceKey}: ` +
          `expected ${coverageRecord.operationId}, found ${pathItem.post?.operationId ?? 'missing'}`,
      );
    }

    const pathSegments = pathKey.split('/').filter(Boolean);
    const namespacesIndex = pathSegments.lastIndexOf('namespaces');
    const apiBase = pathSegments[1];
    const apiPath = pathSegments.at(-1);
    const serviceParts = namespacesIndex > 2 ? pathSegments.slice(2, namespacesIndex) : [];
    const serviceSegment = serviceParts.length > 0 ? serviceParts.join('/') : undefined;
    if (!apiBase || !apiPath || namespacesIndex < 0) {
      throw new Error(`generated contract path for ${resourceKey} is malformed: ${pathKey}`);
    }

    // Handle duplicates: prefer entry with richer field metadata
    if (seen.has(resourceKey)) {
      const existingIdx = results.findIndex((r) => r.resourceKey === resourceKey);
      if (existingIdx >= 0) {
        const existing = results[existingIdx];
        if (!existing) {
          continue;
        }
        const existingFields = existing.fieldMetadata ? Object.keys(existing.fieldMetadata.fields).length : 0;
        const candidateFields = extractResourceFieldMetadata(spec, resourceKey);
        const candidateCount = candidateFields ? Object.keys(candidateFields.fields).length : 0;
        if (candidateCount > existingFields && candidateFields) {
          // The richer spec file also owns the more complete view layout.
          const candidateLayout = buildResourceViewLayout(spec, resourceKey);
          results[existingIdx] = {
            ...existing,
            fieldMetadata: candidateFields,
            viewLayout: candidateLayout ?? existing.viewLayout,
          };
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
    const schemaId = deriveSchemaIdFromPath(resourceKey, pathItem);

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
      namespaceScoped: resourceKey !== 'namespace',
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

    // Build the read-only view layout (GetSpecType superset) for the describe panel
    const viewLayout = buildResourceViewLayout(spec, resourceKey);
    if (viewLayout) {
      result.viewLayout = viewLayout;
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
export function parseAllDomainFiles(domainDir: string, coverage?: ResourceCoverageMap): ParsedSpecInfo[] {
  if (!fs.existsSync(domainDir)) {
    console.error(`Domain directory not found: ${domainDir}`);
    return [];
  }

  const resolvedCoverage = coverage ?? loadResourceCoverage(path.join(domainDir, 'resource_coverage.json'));

  // Sort domain files alphabetically for deterministic processing order.
  // The three metadata contracts are not OpenAPI domain documents.
  const domainFiles = fs
    .readdirSync(domainDir)
    .filter(
      (f) =>
        f.endsWith('.json') && !['namespace_profiles.json', 'resource_coverage.json', 'validation.json'].includes(f),
    )
    .sort();
  console.log(`Found ${domainFiles.length} domain files`);

  const unresolvedManualPaths = new Map(
    Object.entries(resolvedCoverage.resources)
      .filter((entry): entry is [string, ManualResourceCoverage] => entry[1].disposition === 'manual')
      .map(([resourceKey, record]) => [record.path, resourceKey]),
  );
  const manualPathsWithoutGet = new Set<string>();
  for (const filename of domainFiles) {
    let document: OpenAPISpec;
    try {
      document = JSON.parse(fs.readFileSync(path.join(domainDir, filename), 'utf-8')) as OpenAPISpec;
    } catch {
      continue;
    }
    for (const [apiPath] of unresolvedManualPaths) {
      const pathItem = document.paths?.[apiPath];
      if (pathItem?.get) {
        unresolvedManualPaths.delete(apiPath);
      } else if (pathItem) {
        manualPathsWithoutGet.add(apiPath);
      }
    }
  }
  if (unresolvedManualPaths.size > 0) {
    const withoutGet = [...unresolvedManualPaths]
      .filter(([apiPath]) => manualPathsWithoutGet.has(apiPath))
      .map(([apiPath, resourceKey]) => `${resourceKey} (${apiPath})`)
      .sort();
    if (withoutGet.length > 0) {
      throw new Error(`manual coverage paths have no GET list operation: ${withoutGet.join(', ')}`);
    }
    const missing = [...unresolvedManualPaths].map(([apiPath, resourceKey]) => `${resourceKey} (${apiPath})`).sort();
    throw new Error(`stale manual coverage paths: ${missing.join(', ')}`);
  }

  const results: ParsedSpecInfo[] = [];
  const seen = new Set<string>();

  for (const filename of domainFiles) {
    const filePath = path.join(domainDir, filename);
    const domainResults = parseDomainFile(filePath, resolvedCoverage);

    for (const info of domainResults) {
      if (!seen.has(info.resourceKey)) {
        seen.add(info.resourceKey);
        results.push(info);
      } else {
        const existingIdx = results.findIndex((r) => r.resourceKey === info.resourceKey);
        if (existingIdx >= 0) {
          const existing = results[existingIdx];
          if (!existing) {
            continue;
          }
          const existingFieldCount = existing.fieldMetadata ? Object.keys(existing.fieldMetadata.fields).length : 0;
          const candidateFieldCount = info.fieldMetadata ? Object.keys(info.fieldMetadata.fields).length : 0;
          if (candidateFieldCount > existingFieldCount) {
            results[existingIdx] = { ...existing, fieldMetadata: info.fieldMetadata };
          }
        }
      }
    }
  }

  const generatedKeys = Object.entries(resolvedCoverage.resources)
    .filter(([, record]) => record.disposition === 'generated')
    .map(([resourceKey]) => resourceKey);
  const missing = generatedKeys.filter((resourceKey) => !seen.has(resourceKey)).sort();
  if (missing.length > 0) {
    throw new Error(`generated contract resources were not parsed: ${missing.join(', ')}`);
  }

  console.log(`Successfully parsed ${results.length} unique resource types from domain files`);
  return results;
}
