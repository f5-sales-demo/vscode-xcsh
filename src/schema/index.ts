// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Schema module exports for F5 XC JSON IntelliSense.
 */

export type { XCShJsonSchema, SchemaProperty } from './schemaGenerator';
export {
  generateGenericSchema,
  generateSchemaForResourceType,
  getSchemaResourceTypes,
  hasDetailedFieldMetadata,
} from './schemaGenerator';

export { getSchemaRegistry, resetSchemaRegistry, SchemaRegistry } from './schemaRegistry';
