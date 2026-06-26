/**
 * Bridge between the VS Code extension's RESOURCE_TYPES registry and the
 * shared pi-resource-management package's ApiSpecIndex format.
 *
 * This enables the extension to use the same kind resolver, manifest validator,
 * and resource client as the xcsh CLI — single source of truth.
 */

import { RESOURCE_TYPES, type ResourceTypeInfo } from '../api/resourceTypes';

const piResourceManagement = require('@f5-sales-demo/pi-resource-management') as {
  createKindResolver: (specIndex: ApiSpecIndex, validationData?: Record<string, unknown>) => KindResolver;
};

interface ApiSpecIndex {
  version: string;
  timestamp: string;
  domains: Array<{
    domain: string;
    title: string;
    description: string;
    descriptionShort: string;
    category: string;
    pathCount: number;
    schemaCount: number;
    complexity: string;
    resources: Array<{
      name: string;
      description: string;
      apiPaths: string[];
    }>;
  }>;
}

interface KindResolver {
  resolveKind(kind: string): unknown;
  getAllKnownKinds(): string[];
  getKindsWithApiPaths(): string[];
}

function buildApiPaths(info: ResourceTypeInfo): string[] {
  const base = info.apiBase ?? 'config';
  const service = info.serviceSegment ? `/${info.serviceSegment}` : '';
  const prefix = `/api/${base}${service}/namespaces/{namespace}`;

  if (info.customListPath && info.customGetPath) {
    return [info.customListPath, info.customGetPath];
  }

  const listPath = info.customListPath ?? `${prefix}/${info.apiPath}`;
  const getPath = info.customGetPath ?? `${prefix}/${info.apiPath}/{name}`;
  return [listPath, getPath];
}

function buildSpecIndex(): ApiSpecIndex {
  const resources = Object.entries(RESOURCE_TYPES).map(([key, info]) => ({
    name: key,
    description: info.description ?? info.displayName,
    apiPaths: buildApiPaths(info),
  }));

  return {
    version: 'vscode-bridge',
    timestamp: new Date().toISOString(),
    domains: [
      {
        domain: 'vscode',
        title: 'VS Code Extension Resources',
        description: 'Resource types available in the VS Code extension',
        descriptionShort: 'Extension resources',
        category: 'Extension',
        pathCount: resources.length * 2,
        schemaCount: 0,
        complexity: 'standard',
        resources,
      },
    ],
  };
}

let _resolver: KindResolver | undefined;

export function getKindResolver(): KindResolver {
  if (!_resolver) {
    _resolver = piResourceManagement.createKindResolver(buildSpecIndex());
  }
  return _resolver;
}

export function getSpecIndex(): ApiSpecIndex {
  return buildSpecIndex();
}
