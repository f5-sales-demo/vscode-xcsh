// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * JSON Schema generator for F5 XC resource types.
 * Generates schemas from field metadata to enable VSCode IntelliSense.
 */

import {
  GENERATED_RESOURCE_TYPES,
  type GeneratedFieldMetadata,
  type GeneratedResourceTypeInfo,
} from '../generated/resourceTypesBase';

/**
 * JSON Schema draft-07 compatible property definition
 */
export interface SchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: string[];
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  additionalProperties?: SchemaProperty | boolean;
  $ref?: string;
  required?: string[];
  // JSON Schema validation keywords
  pattern?: string;
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  examples?: unknown[];
  // F5 XC custom extensions for IntelliSense hints
  'x-f5xc-required'?: boolean;
  'x-f5xc-server-default'?: boolean;
  'x-f5xc-recommended-value'?: unknown;
  'x-f5xc-conflicts-with'?: string[];
  'x-f5xc-format-description'?: string;
  'x-f5xc-description-short'?: string;
}

/**
 * Complete JSON Schema for an F5 XC resource type
 */
export interface XCSHJsonSchema {
  $schema: string;
  $id: string;
  title: string;
  description?: string;
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
  definitions?: Record<string, SchemaProperty>;
}

/**
 * Parse a dot-notation field path and set a value in a nested object.
 * Creates intermediate objects as needed.
 */
function setNestedProperty(obj: Record<string, SchemaProperty>, path: string, props: Partial<SchemaProperty>): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    const rawPart = parts[i] as string;
    const isArrayItem = rawPart.endsWith('[]');
    const part = isArrayItem ? rawPart.slice(0, -2) : rawPart;
    const isLast = i === parts.length - 1;

    if (isArrayItem) {
      if (!current[part]) {
        current[part] = { type: 'array', items: { type: 'object', properties: {} } };
      }
      if (!current[part].items) {
        current[part].items = { type: 'object', properties: {} };
      }
      const items = current[part].items;
      if (!items.properties) {
        items.properties = {};
      }
      if (isLast) {
        Object.assign(items, props);
      } else {
        current = items.properties ?? {};
      }
    } else if (isLast) {
      if (!current[part]) {
        current[part] = {};
      }
      Object.assign(current[part], props);
    } else {
      if (!current[part]) {
        current[part] = { type: 'object', properties: {} };
      }
      if (!current[part].properties) {
        current[part].properties = {};
      }
      if (!current[part].type) {
        current[part].type = 'object';
      }
      current = current[part]?.properties ?? {};
    }
  }
}

/**
 * Walk a spec schema along a dot-separated path and mark the leaf segment
 * as required on its parent object.  Handles `[]` array notation by
 * descending into `items`.
 */
function markRequiredAtPath(specSchema: SchemaProperty, path: string): void {
  const parts = path.split('.');
  let currentObj: SchemaProperty = specSchema;

  for (let i = 0; i < parts.length; i++) {
    const rawPart = parts[i] as string;
    const isArrayItem = rawPart.endsWith('[]');
    const part = isArrayItem ? rawPart.slice(0, -2) : rawPart;
    const isLast = i === parts.length - 1;

    // Mark this segment required on its parent (whether leaf or intermediate)
    if (!currentObj.required) {
      currentObj.required = [];
    }
    if (!currentObj.required.includes(part)) {
      currentObj.required.push(part);
    }

    if (isLast) {
      return;
    }

    if (!currentObj.properties) {
      return;
    }
    const child = currentObj.properties[part];
    if (!child) {
      return;
    }

    if (isArrayItem) {
      if (!child.items) {
        return;
      }
      currentObj = child.items;
    } else {
      currentObj = child;
    }
  }
}

/**
 * Build metadata schema with standard F5 XC resource metadata fields
 */
function buildMetadataSchema(): SchemaProperty {
  return {
    type: 'object',
    description: 'Resource metadata containing identification and organizational information',
    properties: {
      name: {
        type: 'string',
        description: 'Resource name (required). Must be unique within the namespace.',
        'x-f5xc-required': true,
      },
      namespace: {
        type: 'string',
        description: 'Namespace where the resource resides.',
      },
      labels: {
        type: 'object',
        description: 'Key-value labels for organizing and selecting resources.',
        additionalProperties: { type: 'string' },
      },
      annotations: {
        type: 'object',
        description: 'Key-value annotations for storing non-identifying metadata.',
        additionalProperties: { type: 'string' },
      },
      description: {
        type: 'string',
        description: 'Human-readable description of the resource.',
      },
      disable: {
        type: 'boolean',
        description: 'Set to true to disable this resource.',
        default: false,
      },
    },
    required: ['name'],
  };
}

/**
 * Build spec schema from resource type field metadata
 */
function buildSpecSchema(resourceType: GeneratedResourceTypeInfo): SchemaProperty {
  const specSchema: SchemaProperty = {
    type: 'object',
    description: `${resourceType.displayName} specification`,
    properties: {},
  };

  const fieldMetadata = resourceType.fieldMetadata;

  if (!fieldMetadata?.fields) {
    // No field metadata available - return basic schema
    specSchema.additionalProperties = true;
    return specSchema;
  }

  // Process each field in the metadata
  for (const [fieldPath, metadata] of Object.entries(fieldMetadata.fields)) {
    // Skip non-spec fields
    if (!fieldPath.startsWith('spec.')) {
      continue;
    }

    const specPath = fieldPath.replace('spec.', '');
    const props = buildFieldProperties(metadata);

    setNestedProperty(specSchema.properties ?? {}, specPath, props);
  }

  // Mark required fields at each nesting level
  if (fieldMetadata.userRequiredFields && fieldMetadata.userRequiredFields.length > 0) {
    for (const field of fieldMetadata.userRequiredFields) {
      if (field.startsWith('spec.')) {
        const specPath = field.replace('spec.', '');
        markRequiredAtPath(specSchema, specPath);
      }
    }
  }

  const fieldCount = Object.keys(specSchema.properties ?? {}).length;
  specSchema.additionalProperties = fieldCount < 5;

  return specSchema;
}

/**
 * Build property definition from field metadata
 */
function buildFieldProperties(metadata: GeneratedFieldMetadata): Partial<SchemaProperty> {
  const props: Partial<SchemaProperty> = {};

  if (typeof metadata.descriptionShort === 'string') {
    props.description = metadata.descriptionShort;
  } else if (typeof metadata.description === 'string') {
    props.description = metadata.description;
  }

  // Use explicit type from field metadata when available
  const metaType = (metadata as Record<string, unknown>).type;
  if (typeof metaType === 'string' && metaType.length > 0) {
    props.type = metaType;
  }

  // Infer type from default value if not already known
  if (metadata.default !== undefined) {
    props.default = metadata.default;
    if (!props.type) {
      props.type = inferJsonType(metadata.default);
    }
  }

  // Mark server default fields
  if (metadata.serverDefault) {
    props['x-f5xc-server-default'] = true;
    props.description = `${props.description || ''} (Server provides default value)`;
  }

  // Mark required fields
  if (metadata.requiredFor?.create) {
    props['x-f5xc-required'] = true;
  }

  // Add recommended value
  if (metadata.recommendedValue !== undefined) {
    props['x-f5xc-recommended-value'] = metadata.recommendedValue;
    props.default = props.default ?? metadata.recommendedValue;
    // Infer type from recommended value if not already set
    if (!props.type) {
      props.type = inferJsonType(metadata.recommendedValue);
    }
  }

  // Wire constraints into JSON Schema keywords
  const constraints = metadata.constraints;
  if (constraints && typeof constraints === 'object') {
    if (typeof constraints.pattern === 'string') {
      props.pattern = constraints.pattern;
    }
    if (typeof constraints.maxLength === 'number') {
      props.maxLength = constraints.maxLength;
    }
    if (typeof constraints.minLength === 'number') {
      props.minLength = constraints.minLength;
    }
    if (typeof constraints.minimum === 'number') {
      props.minimum = constraints.minimum;
    }
    if (typeof constraints.maximum === 'number') {
      props.maximum = constraints.maximum;
    }
    if (typeof constraints.multipleOf === 'number') {
      props.multipleOf = constraints.multipleOf;
    }
    if (typeof constraints.formatDescription === 'string') {
      props['x-f5xc-format-description'] = constraints.formatDescription;
    }
  }

  // Add example
  if (metadata.example !== undefined) {
    props.examples = [metadata.example];
  }

  // Add conflicts as custom extension
  if (Array.isArray(metadata.conflictsWith) && metadata.conflictsWith.length > 0) {
    props['x-f5xc-conflicts-with'] = metadata.conflictsWith;
  }

  // Preserve short description for tooltip detail field
  if (metadata.descriptionShort) {
    props['x-f5xc-description-short'] = metadata.descriptionShort;
  }

  if (Array.isArray(metadata.enumValues) && metadata.enumValues.length > 1) {
    props.enum = metadata.enumValues.map(String);
  }

  return props;
}

/**
 * Infer JSON Schema type from a value
 */
function inferJsonType(value: unknown): string | string[] {
  if (value === null) {
    return ['null', 'string'];
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object') {
    return 'object';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  return 'string';
}

/**
 * Generate a JSON Schema for a specific resource type
 *
 * @param resourceTypeKey - The key of the resource type (e.g., 'http_loadbalancer')
 * @returns The generated JSON Schema or null if resource type not found
 */
export function generateSchemaForResourceType(resourceTypeKey: string): XCSHJsonSchema | null {
  const resourceType = GENERATED_RESOURCE_TYPES[resourceTypeKey];
  if (!resourceType) {
    return null;
  }

  const schema: XCSHJsonSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `xcsh-schema://schemas/${resourceTypeKey}.json`,
    title: `xcsh ${resourceType.displayName}`,
    description: resourceType.description,
    type: 'object',
    properties: {
      metadata: buildMetadataSchema(),
      spec: buildSpecSchema(resourceType),
    },
    required: ['metadata', 'spec'],
  };

  return schema;
}

/**
 * Generate a combined schema that can match any F5 XC resource type
 */
export function generateGenericSchema(): XCSHJsonSchema {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'xcsh-schema://schemas/generic.json',
    title: 'xcsh Resource',
    description: 'Generic schema for xcsh resources',
    type: 'object',
    properties: {
      metadata: buildMetadataSchema(),
      spec: {
        type: 'object',
        description: 'Resource specification',
        additionalProperties: true,
      },
    },
    required: ['metadata', 'spec'],
  };
}

/**
 * Get list of all resource type keys that have schemas
 */
export function getSchemaResourceTypes(): string[] {
  return Object.keys(GENERATED_RESOURCE_TYPES);
}

/**
 * Check if a resource type has detailed field metadata
 */
export function hasDetailedFieldMetadata(resourceTypeKey: string): boolean {
  const resourceType = GENERATED_RESOURCE_TYPES[resourceTypeKey];
  return !!(resourceType?.fieldMetadata?.fields && Object.keys(resourceType.fieldMetadata.fields).length > 0);
}
