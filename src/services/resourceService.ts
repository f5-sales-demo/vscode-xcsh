import type { F5XCClient } from '../api/client';
import type { ContextManager } from '../config/contextManager';
import { F5XCApiError } from '../utils/errors';
import { getKindResolver } from '../xcsh/specBridge';

const piResourceManagement = require('@f5xc-salesdemos/pi-resource-management') as {
  ResourceClient: new (options: ResourceClientOptions) => ResourceClientInstance;
  toManifest: (resource: Record<string, unknown>, kind: string) => ExportedManifest;
  buildMinimalExportFilter: (kind: string) => MinimalExportFilter | undefined;
  applyMinimalExportFilter: (
    spec: Record<string, unknown>,
    filter: MinimalExportFilter | undefined,
  ) => Record<string, unknown>;
  formatManifestOutput: (manifests: ExportedManifest[], format: ManifestOutputFormat) => string;
  parseManifests: (objects: Record<string, unknown>[], sourcePath: string) => ResourceManifest[];
  formatDiff: (diff: ResourceDiff) => string;
};

interface MinimalExportFilter {
  serverDefaults?: Record<string, unknown>;
  serverDefaultFields?: string[];
  minimumConfigFields?: string[];
  oneofDefaultVariants?: Record<string, string>;
}

interface HttpTransportRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface HttpTransportResponse {
  httpStatus: number;
  body?: Record<string, unknown>;
}

interface HttpTransport {
  request(req: HttpTransportRequest): Promise<HttpTransportResponse>;
}

interface ResourceClientOptions {
  apiUrl: string;
  apiToken: string;
  namespace: string;
  transport?: HttpTransport;
}

interface ExportedManifest {
  kind: string;
  metadata: Record<string, unknown>;
  spec: Record<string, unknown>;
}

type ManifestOutputFormat = 'json' | 'yaml';

interface ResourceManifest {
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    description?: string;
    disable?: boolean;
  };
  spec: Record<string, unknown>;
  rawObject: Record<string, unknown>;
}

interface ResolvedKind {
  kind: string;
  domain: string;
  paths: {
    list: string;
    get: string;
    create: string;
    update: string;
    delete: string;
  };
}

interface ResourceDiff {
  hasDifferences: boolean;
  added: unknown[];
  removed: unknown[];
  changed: unknown[];
  unchangedCount: number;
}

interface OperationResult {
  status: 'created' | 'updated' | 'unchanged' | 'deleted' | 'error' | 'dry-run';
  resource?: Record<string, unknown>;
  diff?: ResourceDiff;
  error?: { kind: string; message: string; httpStatus?: number };
  name?: string;
  kind?: string;
  durationMs?: number;
  action?: 'create' | 'update';
}

interface ResourceClientInstance {
  apply(
    manifest: ResourceManifest,
    resolved: ResolvedKind,
    namespaceOverride?: string,
    dryRun?: 'client' | 'server',
  ): Promise<OperationResult>;
  create(
    manifest: ResourceManifest,
    resolved: ResolvedKind,
    namespaceOverride?: string,
    dryRun?: 'client' | 'server',
  ): Promise<OperationResult>;
  delete(kind: string, name: string, resolved: ResolvedKind, namespaceOverride?: string): Promise<OperationResult>;
  get(
    resolved: ResolvedKind,
    name?: string,
    namespaceOverride?: string,
  ): Promise<{
    items?: Record<string, unknown>[];
    resource?: Record<string, unknown>;
    error?: { kind: string; message: string };
  }>;
  exportOne(
    kind: string,
    resolved: ResolvedKind,
    name: string,
    namespaceOverride?: string,
  ): Promise<{ manifest?: ExportedManifest; error?: { kind: string; message: string } }>;
  diff(
    manifest: ResourceManifest,
    resolved: ResolvedKind,
    namespaceOverride?: string,
  ): Promise<{ diff?: ResourceDiff; isNew: boolean; error?: { kind: string; message: string } }>;
}

class F5XCTransport implements HttpTransport {
  readonly #client: F5XCClient;
  readonly #baseUrl: string;

  constructor(client: F5XCClient, baseUrl: string) {
    this.#client = client;
    this.#baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(req: HttpTransportRequest): Promise<HttpTransportResponse> {
    const path = req.url.startsWith(this.#baseUrl) ? req.url.slice(this.#baseUrl.length) : req.url;

    try {
      const result = await this.#client.customRequest<Record<string, unknown>>(path, {
        method: req.method,
        body: req.body,
      });
      return { httpStatus: 200, body: result ?? {} };
    } catch (err) {
      if (err instanceof F5XCApiError) {
        let body: Record<string, unknown> | undefined;
        try {
          body = JSON.parse(err.body) as Record<string, unknown>;
        } catch {
          body = { message: err.body };
        }
        return { httpStatus: err.statusCode, body };
      }
      throw err;
    }
  }
}

function parseContentToObjects(content: string): Record<string, unknown>[] {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed as Record<string, unknown>[];
    }
    return [parsed as Record<string, unknown>];
  }

  const yaml = require('yaml') as { parseAllDocuments: (content: string) => Array<{ toJSON: () => unknown }> };
  const docs = yaml.parseAllDocuments(trimmed);
  const objects: Record<string, unknown>[] = [];
  for (const doc of docs) {
    const obj = doc.toJSON();
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      objects.push(obj as Record<string, unknown>);
    }
  }
  if (objects.length === 0) {
    throw new Error('No valid YAML documents found');
  }
  return objects;
}

export class ResourceService {
  readonly #contextManager: ContextManager;

  constructor(contextManager: ContextManager) {
    this.#contextManager = contextManager;
  }

  async getResourceClient(contextName: string): Promise<ResourceClientInstance> {
    const ctx = await this.#contextManager.getContext(contextName);
    if (!ctx) {
      throw new Error(`Context "${contextName}" not found`);
    }

    const client = await this.#contextManager.getClient(contextName);
    const transport = new F5XCTransport(client, ctx.apiUrl);

    return new piResourceManagement.ResourceClient({
      apiUrl: ctx.apiUrl,
      apiToken: ctx.apiToken,
      namespace: ctx.defaultNamespace,
      transport,
    });
  }

  async exportResource(
    contextName: string,
    kind: string,
    name: string,
    namespace: string,
    format: ManifestOutputFormat,
  ): Promise<{ content: string; manifest: ExportedManifest } | { error: string }> {
    const resourceClient = await this.getResourceClient(contextName);
    const resolver = getKindResolver();
    const resolved = resolver.resolveKind(kind) as ResolvedKind;

    const result = await resourceClient.exportOne(kind, resolved, name, namespace);
    if (result.error) {
      return { error: result.error.message };
    }
    if (!result.manifest) {
      return { error: `No manifest returned for ${kind}/${name}` };
    }

    const filter = piResourceManagement.buildMinimalExportFilter(kind);
    const manifest = filter
      ? { ...result.manifest, spec: piResourceManagement.applyMinimalExportFilter(result.manifest.spec, filter) }
      : result.manifest;

    const content = piResourceManagement.formatManifestOutput([manifest], format);
    return { content, manifest };
  }

  async exportAll(
    contextName: string,
    kind: string,
    namespace: string,
    format: ManifestOutputFormat,
  ): Promise<{ manifests: ExportedManifest[]; contents: Map<string, string> } | { error: string }> {
    const resourceClient = await this.getResourceClient(contextName);
    const resolver = getKindResolver();
    const resolved = resolver.resolveKind(kind) as ResolvedKind;

    const listResult = await resourceClient.get(resolved, undefined, namespace);
    if (listResult.error) {
      return { error: listResult.error.message };
    }

    const items = listResult.items ?? [];
    const manifests: ExportedManifest[] = [];
    const contents = new Map<string, string>();

    for (const item of items) {
      const objectData = item.object as Record<string, unknown> | undefined;
      const getSpec = item.get_spec as Record<string, unknown> | undefined;
      const meta = (item.metadata ?? objectData?.metadata ?? getSpec?.metadata ?? {}) as Record<string, unknown>;
      const name = (meta.name as string) ?? (item.name as string);
      if (!name) {
        continue;
      }

      const exportResult = await resourceClient.exportOne(kind, resolved, name, namespace);
      if (exportResult.error || !exportResult.manifest) {
        continue;
      }

      const filter = piResourceManagement.buildMinimalExportFilter(kind);
      const manifest = filter
        ? {
            ...exportResult.manifest,
            spec: piResourceManagement.applyMinimalExportFilter(exportResult.manifest.spec, filter),
          }
        : exportResult.manifest;
      manifests.push(manifest);
      contents.set(name, piResourceManagement.formatManifestOutput([manifest], format));
    }

    return { manifests, contents };
  }

  async applyManifest(contextName: string, content: string, namespaceOverride?: string): Promise<OperationResult> {
    const resourceClient = await this.getResourceClient(contextName);
    const resolver = getKindResolver();
    const manifests = piResourceManagement.parseManifests(parseContentToObjects(content), 'vscode');

    if (manifests.length === 0) {
      return { status: 'error', error: { kind: 'validation', message: 'No valid manifests found in file' } };
    }

    const manifest = manifests[0]!;
    const resolved = resolver.resolveKind(manifest.kind) as ResolvedKind;
    return resourceClient.apply(manifest, resolved, namespaceOverride);
  }

  async createManifest(contextName: string, content: string, namespaceOverride?: string): Promise<OperationResult> {
    const resourceClient = await this.getResourceClient(contextName);
    const resolver = getKindResolver();
    const manifests = piResourceManagement.parseManifests(parseContentToObjects(content), 'vscode');

    if (manifests.length === 0) {
      return { status: 'error', error: { kind: 'validation', message: 'No valid manifests found in file' } };
    }

    const manifest = manifests[0]!;
    const resolved = resolver.resolveKind(manifest.kind) as ResolvedKind;
    const namespace = namespaceOverride ?? manifest.metadata.namespace;

    const existing = await resourceClient.get(resolved, manifest.metadata.name, namespace);
    if (existing.resource) {
      return {
        status: 'error',
        error: {
          kind: 'conflict',
          message: `"${manifest.metadata.name}" already exists. Use XC: Apply to update.`,
          httpStatus: 409,
        },
      };
    }

    return resourceClient.create(manifest, resolved, namespaceOverride);
  }

  async diffManifest(
    contextName: string,
    content: string,
    namespaceOverride?: string,
    format: ManifestOutputFormat = 'json',
  ): Promise<{ diff?: ResourceDiff; isNew: boolean; error?: string; remoteContent?: string }> {
    const resourceClient = await this.getResourceClient(contextName);
    const resolver = getKindResolver();
    const manifests = piResourceManagement.parseManifests(parseContentToObjects(content), 'vscode');

    if (manifests.length === 0) {
      return { isNew: false, error: 'No valid manifests found in file' };
    }

    const manifest = manifests[0]!;
    const resolved = resolver.resolveKind(manifest.kind) as ResolvedKind;
    const namespace = namespaceOverride ?? manifest.metadata.namespace;

    const result = await resourceClient.diff(manifest, resolved, namespace);
    if (result.error) {
      return { isNew: false, error: result.error.message };
    }

    let remoteContent: string | undefined;
    if (!result.isNew) {
      const getResult = await resourceClient.get(resolved, manifest.metadata.name, namespace);
      if (getResult.resource) {
        const remoteManifest = piResourceManagement.toManifest(getResult.resource, manifest.kind);
        remoteContent = piResourceManagement.formatManifestOutput([remoteManifest], format);
      }
    }

    return { diff: result.diff, isNew: result.isNew, remoteContent };
  }

  async deleteFromManifest(contextName: string, content: string, namespaceOverride?: string): Promise<OperationResult> {
    const resourceClient = await this.getResourceClient(contextName);
    const resolver = getKindResolver();
    const manifests = piResourceManagement.parseManifests(parseContentToObjects(content), 'vscode');

    if (manifests.length === 0) {
      return { status: 'error', error: { kind: 'validation', message: 'No valid manifests found in file' } };
    }

    const manifest = manifests[0]!;
    const resolved = resolver.resolveKind(manifest.kind) as ResolvedKind;
    const namespace = namespaceOverride ?? manifest.metadata.namespace;
    return resourceClient.delete(manifest.kind, manifest.metadata.name, resolved, namespace);
  }

  formatDiff(diff: ResourceDiff): string {
    return piResourceManagement.formatDiff(diff);
  }
}
