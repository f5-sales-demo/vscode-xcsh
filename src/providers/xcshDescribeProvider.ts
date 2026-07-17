// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { RESOURCE_TYPES, type ResourceTypeInfo } from '../api/resourceTypes';
import { getQuotaForResourceType, type QuotaItem } from '../api/subscription';
import type { ContextManager } from '../config/contextManager';
import { API_ENDPOINTS } from '../generated/constants';
import { getDocumentationUrl as getGeneratedDocUrl } from '../generated/documentationUrls';
import { API_PATH_TO_RESOURCE_KEY, GENERATED_RESOURCE_TYPES } from '../generated/resourceTypesBase';
import { GENERATED_VIEW_LAYOUTS, type ViewFieldNode } from '../generated/viewLayouts';
import { getLocalizedDisplayName } from '../utils/l10nHelpers';
import { getLogger } from '../utils/logger';
import { escapeHtml, getNonce, getWebviewBaseStyles } from '../utils/panelBaseStyles';
import { getIconForCategory, getToolbarIconSvg } from '../utils/xcshIcons';
import { buildAttachmentName } from '../xcsh/attachment';
import { renderBestPractices } from './metadataRenderer';
import { VIEW_SECTION_MANIFESTS } from './viewSectionManifests';

const logger = getLogger();

/**
 * Represents a field in a section
 */
interface FieldDefinition {
  key: string;
  value: string;
  status?: 'enabled' | 'disabled' | 'warning' | 'good' | 'bad';
}

/**
 * Represents a sub-group within a section (rendered as a boxed container)
 */
interface SubGroupDefinition {
  id: string;
  title: string;
  fields: FieldDefinition[];
}

/**
 * Represents a section in the describe view
 */
interface SectionDefinition {
  id: string;
  title: string;
  subCategoryLabel?: string; // Label shown above sub-groups (e.g., "L7 DDoS Protection Settings")
  subGroups?: SubGroupDefinition[]; // Boxed sub-groups
  fields: FieldDefinition[]; // Ungrouped fields (rendered after sub-groups)
}

/**
 * WebView provider for displaying F5 XC resource descriptions.
 * Matches the F5 XC Console UI layout with toolbar, sidebar, and organized sections.
 */
export class XCSHDescribeProvider {
  private panel: vscode.WebviewPanel | undefined;
  /**
   * The resource currently rendered in the (reused) panel. The webview message
   * handler is registered once at panel creation, so it must read the live
   * resource from here rather than closing over the first describe's arguments.
   */
  private currentDescribe:
    | {
        profileName: string;
        namespace: string;
        resourceType: string;
        resourceName: string;
        resource: Record<string, unknown>;
      }
    | undefined;

  constructor(private readonly contextManager: ContextManager) {}

  /**
   * Format timestamp to locale string
   */
  private formatTimestamp(timestamp: string | undefined): string | undefined {
    if (!timestamp) {
      return undefined;
    }
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  }

  /**
   * Find ResourceTypeInfo by API path
   */
  private findResourceTypeInfo(apiPath: string): ResourceTypeInfo | undefined {
    for (const [, info] of Object.entries(RESOURCE_TYPES)) {
      if (info.apiPath === apiPath) {
        return info;
      }
    }
    return undefined;
  }

  /**
   * Get documentation URL for resource type.
   * Uses URLs generated from OpenAPI spec files at compile time.
   */
  private getDocumentationUrl(resourceType: string): string {
    return getGeneratedDocUrl(resourceType);
  }

  /**
   * Format key for display (snake_case to Title Case)
   */
  private formatKey(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Show the describe panel for a resource
   * @param cachedData Optional cached data from list response (for resources without GET endpoint)
   */
  async showDescribe(
    profileName: string,
    namespace: string,
    resourceType: string,
    resourceName: string,
    cachedData?: Record<string, unknown>,
  ): Promise<void> {
    try {
      logger.debug(`Describing resource: ${resourceName} (${resourceType})`);

      const resourceTypeInfo = this.findResourceTypeInfo(resourceType);
      const displayName = resourceTypeInfo ? getLocalizedDisplayName(resourceTypeInfo.displayName) : resourceType;

      let resource: Record<string, unknown>;

      // Use cached data if available (for resources that don't have a GET endpoint)
      if (resourceTypeInfo?.useListDataForDescribe && cachedData) {
        logger.debug(`Using cached list data for ${resourceName} (no GET endpoint available)`);
        resource = cachedData;
      } else {
        const client = await this.contextManager.getClient(profileName);
        const apiBase = resourceTypeInfo?.apiBase || 'config';
        resource = (await client.getWithOptions(namespace, resourceType, resourceName, {
          apiBase,
          customGetPath: resourceTypeInfo?.customGetPath,
        })) as unknown as Record<string, unknown>;
      }

      // Record the live resource so the (once-registered) message handler always
      // acts on what is currently displayed, even when the panel is reused.
      this.currentDescribe = { profileName, namespace, resourceType, resourceName, resource };

      if (this.panel) {
        this.panel.reveal(vscode.ViewColumn.Beside);
      } else {
        this.panel = vscode.window.createWebviewPanel('xcshDescribe', `${resourceName}`, vscode.ViewColumn.Beside, {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [],
        });

        this.panel.onDidDispose(() => {
          this.panel = undefined;
        });

        // Set up message handler. Registered once; reads the live resource from
        // this.currentDescribe so it stays correct when the panel is reused.
        this.panel.webview.onDidReceiveMessage(async (message: { command: string }) => {
          const current = this.currentDescribe;
          if (!current) {
            return;
          }
          switch (message.command) {
            case 'editResource':
              await vscode.commands.executeCommand('xcsh.edit', {
                profileName: current.profileName,
                namespace: current.namespace,
                resourceType: current.resourceType,
                resourceName: current.resourceName,
              });
              break;
            case 'openDocumentation': {
              const docUrl = this.getDocumentationUrl(current.resourceType);
              await vscode.env.openExternal(vscode.Uri.parse(docUrl));
              break;
            }
            case 'attachToChat': {
              const name = buildAttachmentName(current.resourceType, current.resourceName);
              const content = JSON.stringify(current.resource, null, 2);
              await vscode.commands.executeCommand('xcsh.attachToChat', { name, content });
              break;
            }
          }
        });
      }

      this.panel.title = resourceName;

      // Fetch quota info for this resource type (best effort - don't fail if quota unavailable)
      // Quotas are typically tenant-wide, so try resource's namespace first, then fall back to 'system'
      let quotaInfo: QuotaItem | undefined;
      try {
        const client = await this.contextManager.getClient(profileName);
        logger.info(`Fetching quota for resourceType: ${resourceType}, namespace: ${namespace}`);

        // First try the resource's namespace
        quotaInfo = await getQuotaForResourceType(client, resourceType, namespace);

        // If not found and namespace isn't 'system', fall back to 'system' namespace
        // (quotas are often tenant-wide and stored in system namespace)
        if (!quotaInfo && namespace !== 'system') {
          logger.info(`No quota in ${namespace}, trying system namespace...`);
          quotaInfo = await getQuotaForResourceType(client, resourceType, 'system');
        }

        if (quotaInfo) {
          logger.info(`Found quota info: ${quotaInfo.displayName} - ${quotaInfo.usage}/${quotaInfo.limit}`);
        } else {
          logger.info(`No quota info found for ${resourceType}`);
        }
      } catch (quotaError) {
        const errorMessage = quotaError instanceof Error ? quotaError.message : String(quotaError);
        logger.warn(`Failed to fetch quota info for ${resourceType}: ${errorMessage}`);
      }

      this.panel.webview.html = this.getWebviewContent(
        resource,
        resourceName,
        displayName,
        namespace,
        resourceType,
        profileName,
        quotaInfo,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to describe resource: ${message}`);
      void vscode.window.showErrorMessage(`Failed to describe resource: ${message}`);
    }
  }

  /**
   * Show the describe panel for a namespace object.
   * Uses the same describe webview as other resources, but fetches data from
   * the tenant-level namespaces API: /api/web/namespaces/{name}.
   */
  async showNamespaceDescribe(profileName: string, namespaceName: string): Promise<void> {
    try {
      logger.debug(`Describing namespace: ${namespaceName}`);

      const client = await this.contextManager.getClient(profileName);
      const resource = await client.customRequest<Record<string, unknown>>(
        `${API_ENDPOINTS.NAMESPACES}/${encodeURIComponent(namespaceName)}`,
      );

      const displayName = 'Namespace';

      if (this.panel) {
        this.panel.reveal(vscode.ViewColumn.Beside);
      } else {
        this.panel = vscode.window.createWebviewPanel('xcshDescribe', namespaceName, vscode.ViewColumn.Beside, {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [],
        });

        this.panel.onDidDispose(() => {
          this.panel = undefined;
        });
      }

      this.panel.title = namespaceName;
      this.panel.webview.html = this.getWebviewContent(
        resource,
        namespaceName,
        displayName,
        '',
        'namespaces',
        profileName,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to describe namespace: ${message}`);
      void vscode.window.showErrorMessage(`Failed to describe namespace: ${message}`);
    }
  }

  /**
   * Generate HTML content for the webview
   */
  private getWebviewContent(
    resource: Record<string, unknown>,
    resourceName: string,
    resourceType: string,
    namespace: string,
    apiPath: string,
    profileName: string,
    quotaInfo?: QuotaItem,
  ): string {
    const nonce = getNonce();
    const cspSource = this.panel?.webview.cspSource;
    const metadata = resource.metadata as Record<string, unknown> | undefined;
    const systemMetadata = resource.system_metadata as Record<string, unknown> | undefined;
    const spec = resource.spec as Record<string, unknown> | undefined;

    // Extract sections based on resource type
    const sections = this.extractSections(apiPath, metadata, systemMetadata, spec, namespace);

    // Generate JSON content for JSON tab
    const jsonContent = JSON.stringify(resource, null, 2);

    const resourceInfo = this.findResourceTypeInfo(apiPath);
    const categoryIconName = getIconForCategory(resourceInfo?.category ?? '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource};">
  <style>
    ${this.getStyles()}
  </style>
</head>
<body data-profile="${escapeHtml(profileName)}" data-namespace="${escapeHtml(namespace)}" data-resource-type="${escapeHtml(apiPath)}" data-resource-name="${escapeHtml(resourceName)}">
  <!-- Top Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      ${getToolbarIconSvg(categoryIconName)}
      <span class="resource-type">${escapeHtml(resourceType)}</span>
      <span class="resource-name">${escapeHtml(resourceName)}</span>
    </div>
    <div class="toolbar-center">
      <button class="tab-btn active" data-tab="form">Form</button>
      <button class="tab-btn" data-tab="documentation">Documentation</button>
      <button class="tab-btn" data-tab="json">JSON</button>
    </div>
    <div class="toolbar-right">
      <input type="text" class="search-input" placeholder="Search..." />
      <button class="attach-chat-btn">${vscode.l10n.t('Add to xcsh chat')}</button>
      <button class="edit-btn">${vscode.l10n.t('Edit Configuration')}</button>
    </div>
  </div>

  <!-- Main Container -->
  <div class="container">
    <!-- Left Sidebar Navigation -->
    <nav class="sidebar">
      <ul class="nav-list">
        ${sections.map((s) => `<li class="nav-item" data-section="${s.id}">${escapeHtml(s.title)}</li>`).join('\n        ')}
      </ul>
    </nav>

    <!-- Main Content Area -->
    <main class="content">
      <!-- Form View (default) -->
      <div class="tab-content active" id="form-view">
        ${quotaInfo ? this.renderQuotaWidget(quotaInfo, resourceType) : this.renderQuotaUnavailable(resourceType)}
        ${sections.map((s) => this.renderSection(s)).join('\n')}
        ${this.renderBestPracticesPanel(apiPath)}
      </div>

      <!-- JSON View -->
      <div class="tab-content" id="json-view">
        <pre class="json-content"><code>${escapeHtml(jsonContent)}</code></pre>
      </div>
    </main>
  </div>

  <script nonce="${nonce}">
    ${this.getScript()}
  </script>
</body>
</html>`;
  }

  /**
   * Extract all sections for a resource. Spec-driven for every type: labels/order
   * come from the generated view layout; a curated section manifest (when present)
   * groups fields into the console's exact section titles.
   */
  private extractSections(
    apiPath: string,
    metadata: Record<string, unknown> | undefined,
    systemMetadata: Record<string, unknown> | undefined,
    spec: Record<string, unknown> | undefined,
    namespace: string,
  ): SectionDefinition[] {
    const resourceKey = API_PATH_TO_RESOURCE_KEY[apiPath];
    return this.extractSpecDrivenSections(resourceKey, metadata, systemMetadata, spec, namespace);
  }

  /**
   * Shared Metadata section used by every resource view (Name, Namespace,
   * Description, Labels, Creator, timestamps, UID).
   */
  private buildMetadataSection(
    metadata: Record<string, unknown> | undefined,
    systemMetadata: Record<string, unknown> | undefined,
    namespace: string,
  ): SectionDefinition {
    const fields: FieldDefinition[] = [];
    if (metadata?.name) {
      fields.push({ key: 'Name', value: String(metadata.name) });
    }
    fields.push({ key: 'Namespace', value: namespace });
    if (metadata?.description) {
      fields.push({ key: 'Description', value: String(metadata.description) });
    }
    if (systemMetadata?.creator_id) {
      fields.push({ key: 'Creator', value: String(systemMetadata.creator_id) });
    }
    const createTime = this.formatTimestamp(systemMetadata?.creation_timestamp as string | undefined);
    if (createTime) {
      fields.push({ key: 'Created', value: createTime });
    }
    const modTime = this.formatTimestamp(systemMetadata?.modification_timestamp as string | undefined);
    if (modTime) {
      fields.push({ key: 'Last Modified', value: modTime });
    }
    if (systemMetadata?.uid) {
      fields.push({ key: 'UID', value: String(systemMetadata.uid) });
    }
    const labels = metadata?.labels as Record<string, string> | undefined;
    if (labels && Object.keys(labels).length > 0) {
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      fields.push({ key: 'Labels', value: labelStr });
    }
    return { id: 'metadata', title: vscode.l10n.t('Metadata'), fields };
  }

  /**
   * Build the resource view generically from the spec-driven view layout, applying
   * a curated section manifest when one exists (exact console titles/grouping).
   */
  private extractSpecDrivenSections(
    resourceKey: string | undefined,
    metadata: Record<string, unknown> | undefined,
    systemMetadata: Record<string, unknown> | undefined,
    spec: Record<string, unknown> | undefined,
    namespace: string,
  ): SectionDefinition[] {
    const sections: SectionDefinition[] = [this.buildMetadataSection(metadata, systemMetadata, namespace)];
    if (!spec) {
      return sections;
    }

    const layout = resourceKey ? GENERATED_VIEW_LAYOUTS[resourceKey] : undefined;
    const layoutMap = new Map<string, ViewFieldNode>();
    for (const node of layout?.fields ?? []) {
      layoutMap.set(node.key, node);
    }

    const manifest = resourceKey ? VIEW_SECTION_MANIFESTS[resourceKey] : undefined;
    const overrides = manifest?.labelOverrides ?? {};
    const consumed = new Set<string>();

    if (manifest) {
      for (const ms of manifest.sections) {
        sections.push(this.buildSpecSection(ms.id, ms.title, ms.keys, spec, layoutMap, overrides, consumed));
      }
      // Any present spec key the manifest did not claim → trailing catch-all so
      // coverage is never silently dropped.
      const leftover = Object.keys(spec).filter((k) => !consumed.has(k) && this.isPresent(spec, k));
      if (leftover.length > 0) {
        sections.push(
          this.buildSpecSection('additional', 'Additional Settings', leftover, spec, layoutMap, overrides, consumed),
        );
      }
      return sections;
    }

    // No manifest: derive grouping from the layout. Scalars → "Configuration";
    // each present object/array top-level field becomes its own titled section.
    const orderedKeys = layout?.fields.map((f) => f.key) ?? Object.keys(spec);
    const seen = new Set(orderedKeys);
    for (const k of Object.keys(spec)) {
      if (!seen.has(k)) {
        orderedKeys.push(k);
      }
    }

    const scalarKeys: string[] = [];
    const complexKeys: string[] = [];
    for (const key of orderedKeys) {
      if (!this.isPresent(spec, key)) {
        continue;
      }
      const v = spec[key];
      if (v !== null && typeof v === 'object') {
        complexKeys.push(key);
      } else {
        scalarKeys.push(key);
      }
    }
    if (scalarKeys.length > 0) {
      sections.push(
        this.buildSpecSection(
          'configuration',
          vscode.l10n.t('Configuration'),
          scalarKeys,
          spec,
          layoutMap,
          overrides,
          consumed,
        ),
      );
    }
    for (const key of complexKeys) {
      const node = layoutMap.get(key);
      const title = overrides[key] || node?.label || this.formatKey(key);
      sections.push(this.buildSpecSection(`s-${key}`, title, [key], spec, layoutMap, overrides, consumed));
    }
    return sections;
  }

  /**
   * Presence check: key exists with a non-null, non-empty-string value. Empty
   * objects/arrays still count — in F5 XC they encode a selected oneof choice.
   */
  private isPresent(spec: Record<string, unknown>, key: string): boolean {
    if (!(key in spec)) {
      return false;
    }
    const v = spec[key];
    return v !== null && v !== undefined && v !== '';
  }

  /** Build one section from a list of spec keys, marking them consumed. */
  private buildSpecSection(
    id: string,
    title: string,
    keys: string[],
    spec: Record<string, unknown>,
    layoutMap: Map<string, ViewFieldNode>,
    overrides: Record<string, string>,
    consumed: Set<string>,
  ): SectionDefinition {
    const fields: FieldDefinition[] = [];
    const subGroups: SubGroupDefinition[] = [];

    for (const key of keys) {
      consumed.add(key);
      if (!this.isPresent(spec, key)) {
        continue;
      }
      const node = layoutMap.get(key);
      const label = overrides[key] || node?.label || this.formatKey(key);
      this.renderSpecKey(key, label, node, spec[key], fields, subGroups);
    }

    const section: SectionDefinition = { id, title, fields };
    if (subGroups.length > 0) {
      section.subGroups = subGroups;
    }
    return section;
  }

  /** Render a single spec key into fields/subGroups based on its shape. */
  private renderSpecKey(
    key: string,
    label: string,
    node: ViewFieldNode | undefined,
    value: unknown,
    fields: FieldDefinition[],
    subGroups: SubGroupDefinition[],
  ): void {
    // Scalars
    if (value === null || typeof value !== 'object') {
      fields.push({ key: label, value: this.formatScalar(value) });
      return;
    }
    // Arrays
    if (Array.isArray(value)) {
      if (value.length === 0) {
        fields.push({ key: label, value: this.presenceValue(key) });
        return;
      }
      if (value.every((v) => v === null || typeof v !== 'object')) {
        fields.push({ key: label, value: value.map((v) => this.formatScalar(v)).join(', ') });
        return;
      }
      const itemFields: FieldDefinition[] = value.slice(0, 25).map((item, i) => ({
        key: this.itemLabel(item as Record<string, unknown>, i),
        value: this.itemSummary(item as Record<string, unknown>),
      }));
      if (value.length > 25) {
        itemFields.push({ key: '…', value: `${value.length - 25} more` });
      }
      subGroups.push({ id: `sg-${key}`, title: `${label} (${value.length})`, fields: itemFields });
      return;
    }
    // Objects
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 0) {
      fields.push({ key: label, value: this.presenceValue(key) });
      return;
    }
    const childFields = this.flattenObject(obj, node, 1);
    if (childFields.length === 0) {
      fields.push({ key: label, value: this.presenceValue(key) });
    } else if (childFields.length <= 2) {
      for (const f of childFields) {
        fields.push({ key: `${label} · ${f.key}`, value: f.value });
      }
    } else {
      subGroups.push({ id: `sg-${key}`, title: label, fields: childFields });
    }
  }

  /** Flatten an object's fields into labelled rows, bounded to shallow depth. */
  private flattenObject(
    obj: Record<string, unknown>,
    node: ViewFieldNode | undefined,
    depth: number,
  ): FieldDefinition[] {
    const childMap = new Map<string, ViewFieldNode>();
    for (const c of node?.children ?? []) {
      childMap.set(c.key, c);
    }
    const out: FieldDefinition[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const cn = childMap.get(k);
      const label = cn?.label || this.formatKey(k);
      if (v === null || typeof v !== 'object') {
        out.push({ key: label, value: this.formatScalar(v) });
      } else if (Array.isArray(v)) {
        if (v.length === 0) {
          continue;
        }
        if (v.every((x) => x === null || typeof x !== 'object')) {
          out.push({ key: label, value: v.map((x) => this.formatScalar(x)).join(', ') });
        } else {
          out.push({ key: label, value: `${v.length} item(s)` });
        }
      } else if (Object.keys(v).length === 0) {
        out.push({ key: label, value: this.presenceValue(k) });
      } else if (depth < 2) {
        for (const f of this.flattenObject(v as Record<string, unknown>, cn, depth + 1)) {
          out.push({ key: `${label} · ${f.key}`, value: f.value });
        }
      } else {
        out.push({ key: label, value: 'Configured' });
      }
    }
    return out;
  }

  /** Value shown for present-but-empty objects/arrays (oneof choice markers). */
  private presenceValue(key: string): string {
    if (key.startsWith('disable_')) {
      return 'Disabled';
    }
    if (key.startsWith('enable_')) {
      return 'Enabled';
    }
    if (key.startsWith('no_')) {
      return 'No';
    }
    return 'Configured';
  }

  /** Format a scalar value for display. */
  private formatScalar(value: unknown): string {
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    return String(value);
  }

  /** Best-effort human label for an array item (name-like field, else index). */
  private itemLabel(item: Record<string, unknown>, index: number): string {
    for (const k of ['name', 'label', 'type', 'host_name', 'domain']) {
      if (typeof item[k] === 'string' && item[k]) {
        return String(item[k]);
      }
    }
    const pool = item.pool as Record<string, unknown> | undefined;
    if (pool && typeof pool.name === 'string') {
      return pool.name;
    }
    return `Item ${index + 1}`;
  }

  /** Short summary of an array item's leading scalar fields. */
  private itemSummary(item: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(item)) {
      if (v !== null && typeof v !== 'object') {
        parts.push(`${this.formatKey(k)}: ${this.formatScalar(v)}`);
      }
      if (parts.length >= 3) {
        break;
      }
    }
    return parts.join(', ') || 'Configured';
  }

  /**
   * Render a section as HTML
   */
  private renderSection(section: SectionDefinition): string {
    // Show "Not Configured" for empty sections (no fields and no sub-groups)
    const hasContent = section.fields.length > 0 || (section.subGroups && section.subGroups.length > 0);
    if (!hasContent) {
      return `
      <section class="section" id="section-${section.id}">
        <h3 class="section-header">${escapeHtml(section.title)}</h3>
        <div class="section-body">
          <div class="not-configured">${vscode.l10n.t('Not Configured')}</div>
        </div>
      </section>
      `;
    }

    // Check for single-field section with matching key - render as compact inline row
    // This eliminates redundant headers like "Virtual Host State" -> "Virtual Host State: READY"
    const firstField = section.fields[0];
    const isSingleFieldWithMatchingKey =
      section.fields.length === 1 &&
      (!section.subGroups || section.subGroups.length === 0) &&
      !section.subCategoryLabel &&
      firstField?.key === section.title;

    if (isSingleFieldWithMatchingKey) {
      return this.renderCompactSection(section);
    }

    // Build sub-category label if present
    const subCategoryHtml = section.subCategoryLabel
      ? `<div class="sub-category-label">${escapeHtml(section.subCategoryLabel)}</div>`
      : '';

    // Build sub-groups HTML
    const subGroupsHtml = section.subGroups ? section.subGroups.map((sg) => this.renderSubGroup(sg)).join('\n') : '';

    // Build ungrouped fields HTML
    const ungroupedFieldsHtml =
      section.fields.length > 0 ? `<div class="ungrouped-fields">${this.renderFields(section.fields)}</div>` : '';

    return `
      <section class="section" id="section-${section.id}">
        <h3 class="section-header">${escapeHtml(section.title)}</h3>
        <div class="section-body">
          ${subCategoryHtml}
          ${subGroupsHtml}
          ${ungroupedFieldsHtml}
        </div>
      </section>
    `;
  }

  /**
   * Render quota widget showing resource usage vs limit
   */
  private renderQuotaWidget(quotaInfo: QuotaItem, _resourceType: string): string {
    const percentUsed = quotaInfo.percentUsed;
    const available = quotaInfo.limit - quotaInfo.usage;

    // Determine color based on usage percentage
    let progressColor = 'var(--vscode-testing-iconPassed, #73c991)'; // Green
    let statusText = 'Good';
    if (percentUsed >= 80) {
      progressColor = 'var(--vscode-testing-iconFailed, #f14c4c)'; // Red
      statusText = 'Critical';
    } else if (percentUsed >= 60) {
      progressColor = 'var(--vscode-testing-iconQueued, #cca700)'; // Yellow
      statusText = 'Warning';
    }

    return `
      <div class="quota-widget">
        <div class="quota-header">
          <span class="quota-title">${vscode.l10n.t('Resource Quota')}</span>
          <span class="quota-status" style="color: ${progressColor}">${statusText}</span>
        </div>
        <div class="quota-content">
          <div class="quota-info">
            <span class="quota-label">Resource Type:</span>
            <span class="quota-value">${escapeHtml(quotaInfo.displayName)}</span>
          </div>
          <div class="quota-info">
            <span class="quota-label">Used:</span>
            <span class="quota-value">${quotaInfo.usage} of ${quotaInfo.limit}</span>
          </div>
          <div class="quota-info">
            <span class="quota-label">Available:</span>
            <span class="quota-value">${available}</span>
          </div>
          <div class="quota-progress-container">
            <div class="quota-progress-bar">
              <div class="quota-progress-fill" style="width: ${Math.min(percentUsed, 100)}%; background: ${progressColor}"></div>
            </div>
            <span class="quota-percent">${percentUsed}%</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a subtle fallback when quota info is unavailable
   */
  private renderQuotaUnavailable(resourceType: string): string {
    return `
      <div class="quota-widget quota-unavailable">
        <div class="quota-header">
          <span class="quota-title">${vscode.l10n.t('Resource Quota')}</span>
          <span class="quota-status" style="color: var(--vscode-descriptionForeground)">${vscode.l10n.t('Unavailable')}</span>
        </div>
        <div class="quota-content">
          <div class="quota-info">
            <span class="quota-label">Resource Type:</span>
            <span class="quota-value">${escapeHtml(resourceType)}</span>
          </div>
          <div class="quota-info">
            <span class="quota-value" style="color: var(--vscode-descriptionForeground); font-style: italic;">
              ${vscode.l10n.t('Quota information is not available for this resource type.')}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a compact section for single-field sections where field key matches title
   * This eliminates redundant headers and renders as a simple inline row
   */
  private renderCompactSection(section: SectionDefinition): string {
    const field = section.fields[0];
    // Safety check (should never happen as this is only called for single-field sections)
    if (!field) {
      return '';
    }

    const statusClass = field.status ? ` status-${field.status}` : '';
    const statusIcon = this.getStatusIcon(field.status);
    const keyLower = field.key?.toLowerCase() || '';
    const valueLower = field.value?.toLowerCase() || '';

    return `
      <section class="section section-compact" id="section-${section.id}">
        <div class="field-row compact-row" data-key="${escapeHtml(keyLower)}" data-value="${escapeHtml(valueLower)}">
          <span class="field-key">${escapeHtml(field.key)}:</span>
          <span class="field-value${statusClass}">${statusIcon}${escapeHtml(field.value)}</span>
        </div>
      </section>
    `;
  }

  /**
   * Render a sub-group with boxed container
   */
  private renderSubGroup(subGroup: SubGroupDefinition): string {
    return `
      <div class="sub-group" id="subgroup-${subGroup.id}">
        <div class="sub-group-header">${escapeHtml(subGroup.title)}</div>
        ${this.renderFields(subGroup.fields)}
      </div>
    `;
  }

  /**
   * Render an array of fields as field rows
   */
  private renderFields(fields: FieldDefinition[]): string {
    return fields
      .map((field) => {
        const statusClass = field.status ? ` status-${field.status}` : '';
        const statusIcon = this.getStatusIcon(field.status);
        return `
        <div class="field-row" data-key="${escapeHtml(field.key.toLowerCase())}" data-value="${escapeHtml(field.value.toLowerCase())}">
          <span class="field-icon"></span>
          <span class="field-key">${escapeHtml(field.key)}</span>
          <span class="field-value${statusClass}">${statusIcon}${escapeHtml(field.value)}</span>
        </div>`;
      })
      .join('\n');
  }

  /**
   * Get status icon based on status
   */
  private getStatusIcon(status: string | undefined): string {
    switch (status) {
      case 'enabled':
      case 'good':
        return '<span class="status-icon good"></span>';
      case 'disabled':
      case 'bad':
        return '<span class="status-icon bad"></span>';
      case 'warning':
        return '<span class="status-icon warning"></span>';
      default:
        return '';
    }
  }

  /**
   * Get CSS styles
   */
  private getStyles(): string {
    return `
    ${getWebviewBaseStyles()}

    body {
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Toolbar override */
    .toolbar { flex-shrink: 0; }

    .tab-btn {
      background: transparent;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      color: var(--vscode-descriptionForeground);
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .tab-btn:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    .tab-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }

    .search-input {
      width: 160px;
      padding: 6px 12px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: 12px;
    }

    .search-input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-input-background);
    }

    .edit-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      font-size: 12px;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .edit-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .attach-chat-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      font-size: 12px;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .attach-chat-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* Container */
    .container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: 200px;
      min-width: 200px;
      background: var(--vscode-sideBar-background);
      border-right: 1px solid var(--vscode-panel-border);
      overflow-y: auto;
      padding: 8px 0;
      flex-shrink: 0;
    }

    .nav-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .nav-item {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-sideBar-foreground);
      border-left: 3px solid transparent;
      transition: all 0.1s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nav-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .nav-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      border-left-color: var(--f5-brand-red);
    }

    /* Main Content */
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Sections */
    .section {
      margin-bottom: 24px;
      scroll-margin-top: 16px;
    }

    .section.hidden {
      display: none;
    }

    /* Compact section - single-field sections without redundant header */
    .section-compact {
      margin-bottom: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .section-compact .compact-row {
      padding: 4px 0;
    }

    .section-compact .field-key {
      color: var(--vscode-symbolIcon-classForeground);
      font-weight: 600;
    }

    .section-header {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-symbolIcon-classForeground);
      margin: 0 0 12px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .section-body {
      display: flex;
      flex-direction: column;
    }

    /* Sub-category label */
    .sub-category-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
      padding-left: 8px;
    }

    /* Sub-group box container */
    .sub-group {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      margin-bottom: 16px;
      padding: 12px;
      background: var(--vscode-editor-background);
    }

    .sub-group-header {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      margin-bottom: 8px;
      padding-bottom: 4px;
    }

    .sub-group .field-row {
      padding: 4px 8px;
    }

    /* Ungrouped fields after sub-groups */
    .ungrouped-fields {
      margin-top: 8px;
    }

    .not-configured {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 8px;
      font-size: 12px;
    }

    /* Field Rows */
    .field-row {
      display: flex;
      align-items: flex-start;
      padding: 6px 8px;
      gap: 12px;
      border-radius: 3px;
    }

    .field-row:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .field-row.hidden {
      display: none;
    }

    .field-icon {
      width: 16px;
      flex-shrink: 0;
    }

    .field-key {
      color: var(--vscode-descriptionForeground);
      min-width: 200px;
      flex-shrink: 0;
      font-size: 12px;
    }

    .field-value {
      color: var(--vscode-editor-foreground);
      word-break: break-word;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Status Icons */
    .status-icon {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-icon.good {
      background-color: var(--vscode-testing-iconPassed, #73c991);
    }

    .status-icon.bad {
      background-color: var(--vscode-testing-iconFailed, #f14c4c);
    }

    .status-icon.warning {
      background-color: var(--vscode-testing-iconQueued, #cca700);
    }

    .status-enabled, .status-good {
      color: var(--vscode-testing-iconPassed, #73c991);
    }

    .status-disabled, .status-bad {
      color: var(--vscode-testing-iconFailed, #f14c4c);
    }

    .status-warning {
      color: var(--vscode-testing-iconQueued, #cca700);
    }

    /* Quota Widget */
    .quota-widget {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }

    .quota-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .quota-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-symbolIcon-classForeground);
    }

    .quota-status {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .quota-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .quota-info {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .quota-label {
      color: var(--vscode-descriptionForeground);
      min-width: 100px;
    }

    .quota-value {
      color: var(--vscode-editor-foreground);
      font-weight: 500;
    }

    .quota-progress-container {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 4px;
    }

    .quota-progress-bar {
      flex: 1;
      height: 8px;
      background: var(--vscode-progressBar-background, rgba(255, 255, 255, 0.1));
      border-radius: 4px;
      overflow: hidden;
    }

    .quota-progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .quota-percent {
      font-size: 12px;
      font-weight: 600;
      min-width: 40px;
      text-align: right;
      color: var(--vscode-editor-foreground);
    }

    /* Quota unavailable state */
    .quota-unavailable {
      opacity: 0.7;
      border-color: var(--vscode-panel-border, rgba(255, 255, 255, 0.1));
    }

    .quota-unavailable .quota-header {
      background: var(--vscode-sideBar-background, rgba(255, 255, 255, 0.03));
    }

    /* JSON View */
    .json-content {
      background: var(--vscode-textCodeBlock-background);
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre;
      margin: 0;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 5px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }
    `;
  }

  /**
   * Get JavaScript for interactivity
   */
  private getScript(): string {
    return `
    (function() {
      const vscode = acquireVsCodeApi();

      // DOM Elements
      const tabButtons = document.querySelectorAll('.tab-btn');
      const tabContents = document.querySelectorAll('.tab-content');
      const navItems = document.querySelectorAll('.nav-item');
      const searchInput = document.querySelector('.search-input');
      const editButton = document.querySelector('.edit-btn');
      const sections = document.querySelectorAll('.section');
      const content = document.querySelector('.content');

      // Tab Switching
      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;

          if (tab === 'documentation') {
            vscode.postMessage({ command: 'openDocumentation' });
            return;
          }

          tabButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          tabContents.forEach(c => {
            c.classList.remove('active');
            if (c.id === tab + '-view') {
              c.classList.add('active');
            }
          });
        });
      });

      // Sidebar Navigation
      navItems.forEach(item => {
        item.addEventListener('click', () => {
          const sectionId = item.dataset.section;
          const targetSection = document.getElementById('section-' + sectionId);

          if (targetSection) {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      // Search Filtering
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const fieldRows = document.querySelectorAll('.field-row');

        if (!query) {
          fieldRows.forEach(row => row.classList.remove('hidden'));
          sections.forEach(section => section.classList.remove('hidden'));
          return;
        }

        fieldRows.forEach(row => {
          const key = row.dataset.key || '';
          const value = row.dataset.value || '';
          if (key.includes(query) || value.includes(query)) {
            row.classList.remove('hidden');
          } else {
            row.classList.add('hidden');
          }
        });

          sections.forEach(section => {
            const visibleRows = section.querySelectorAll('.field-row:not(.hidden)');
            if (visibleRows.length === 0) {
              section.classList.add('hidden');
            } else {
              section.classList.remove('hidden');
            }
          });
        });
      }

      // Edit Button
      if (editButton) {
        editButton.addEventListener('click', () => {
          vscode.postMessage({ command: 'editResource' });
        });
      }

      // Add to xcsh chat Button
      const attachChatButton = document.querySelector('.attach-chat-btn');
      if (attachChatButton) {
        attachChatButton.addEventListener('click', () => {
          vscode.postMessage({ command: 'attachToChat' });
        });
      }

      // Intersection Observer for active section tracking
      const observerOptions = {
        root: content,
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0
      };

      const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const sectionId = entry.target.id.replace('section-', '');
            navItems.forEach(item => {
              if (item.dataset.section === sectionId) {
                item.classList.add('active');
              } else {
                item.classList.remove('active');
              }
            });
          }
        });
      }, observerOptions);

      sections.forEach(section => sectionObserver.observe(section));

      // Set first nav item as active
      if (navItems.length > 0) {
        navItems[0].classList.add('active');
      }
    })();
    `;
  }

  /**
   * Render best practices panel for a resource type
   */
  private renderBestPracticesPanel(apiPath: string): string {
    const resourceKey = apiPath.endsWith('s') ? apiPath.slice(0, -1) : apiPath;
    const generated = GENERATED_RESOURCE_TYPES[resourceKey];
    const bp = (generated as Record<string, unknown> | undefined)?.bestPractices as
      | {
          commonErrors?: Array<{
            code: number;
            message: string;
            resolution: string;
            prevention?: string;
          }>;
          securityNotes?: string[];
          performanceTips?: string[];
        }
      | undefined;

    const html = renderBestPractices(bp);
    if (!html) {
      return '';
    }

    return `<details class="best-practices-panel" style="margin-top:16px;padding:12px;border:1px solid var(--vscode-panel-border);border-radius:4px;"><summary style="cursor:pointer;font-weight:bold;">${vscode.l10n.t('Best Practices')}</summary>${html}</details>`;
  }

  /**
   * Dispose of the webview panel
   */
  dispose(): void {
    this.panel?.dispose();
  }
}
