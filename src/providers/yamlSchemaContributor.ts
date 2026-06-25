// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getSchemaRegistry } from '../schema/schemaRegistry';
import { getLogger } from '../utils/logger';
import { getManifestKind } from '../utils/manifestDetector';

const SCHEMA_PREFIX = 'xcsh';
const YAML_EXTENSION_ID = 'redhat.vscode-yaml';

interface YamlExtensionApi {
  registerContributor(
    schema: string,
    requestSchema: (resource: string) => string,
    requestSchemaContent: (uri: string) => Promise<string> | string,
    label?: string,
  ): boolean;
}

export async function registerYamlSchemaContributor(context: vscode.ExtensionContext): Promise<void> {
  const logger = getLogger();
  const yamlExtension = vscode.extensions.getExtension(YAML_EXTENSION_ID);

  if (!yamlExtension) {
    logger.info('YAML extension not installed, skipping YAML schema registration');
    showInstallSuggestion(context);
    return;
  }

  try {
    const api = (await yamlExtension.activate()) as YamlExtensionApi | undefined;
    if (!api?.registerContributor) {
      logger.warn('YAML extension API does not support registerContributor');
      return;
    }

    const registered = api.registerContributor(SCHEMA_PREFIX, requestSchemaUri, requestSchemaContent);

    if (registered) {
      logger.info('YAML schema contributor registered successfully');
    } else {
      logger.warn('YAML schema contributor registration returned false');
    }
  } catch (error) {
    logger.error('Failed to register YAML schema contributor', error as Error);
  }
}

function requestSchemaUri(resource: string): string {
  try {
    const document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === resource);

    if (!document) {
      return '';
    }

    const kind = getManifestKind(document.getText());
    if (!kind) {
      return '';
    }

    const registry = getSchemaRegistry();
    if (!registry.hasSchema(kind)) {
      return '';
    }

    return `${SCHEMA_PREFIX}://schemas/${kind}.json`;
  } catch {
    return '';
  }
}

function requestSchemaContent(uri: string): string {
  try {
    const match = uri.match(/xcsh:\/\/schemas\/(.+)\.json/);
    if (!match?.[1]) {
      return '';
    }

    const resourceType = match[1];
    const registry = getSchemaRegistry();
    const content = registry.getSchemaContent(resourceType);
    return content ?? '';
  } catch {
    return '';
  }
}

let suggestionShown = false;

function showInstallSuggestion(context: vscode.ExtensionContext): void {
  if (suggestionShown) {
    return;
  }

  const suppressKey = 'xcsh.yamlSuggestionDismissed';
  if (context.globalState.get<boolean>(suppressKey)) {
    return;
  }

  suggestionShown = true;

  void vscode.window
    .showInformationMessage(
      'Install the YAML extension for XC manifest autocomplete and validation in YAML files.',
      'Install',
      "Don't show again",
    )
    .then((choice) => {
      if (choice === 'Install') {
        void vscode.commands.executeCommand('workbench.extensions.installExtension', YAML_EXTENSION_ID);
      } else if (choice === "Don't show again") {
        void context.globalState.update(suppressKey, true);
      }
    });
}
