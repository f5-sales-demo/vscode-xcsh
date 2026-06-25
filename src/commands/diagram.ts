// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { XCSHDiagramProvider } from '../providers/xcshDiagramProvider';
import type { ResourceNode } from '../tree/xcshExplorer';
import { showWarning, withErrorHandling } from '../utils/errors';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/**
 * Register diagram commands for F5 XC HTTP Load Balancers
 */
export function registerDiagramCommands(context: vscode.ExtensionContext, contextManager: ContextManager): void {
  // Create diagram provider instance
  const diagramProvider = new XCSHDiagramProvider(contextManager);

  // Register dispose handler
  context.subscriptions.push({
    dispose: () => diagramProvider.dispose(),
  });

  // DIAGRAM - Generate Mermaid diagram for HTTP Load Balancer
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.diagram', async (node: ResourceNode) => {
      await withErrorHandling(async () => {
        const data = node.getData();
        const ctx = await contextManager.getContext(data.profileName);

        if (!ctx) {
          showWarning(`Context "${data.profileName}" not found`);
          return;
        }

        // Verify this is an HTTP Load Balancer
        if (data.resourceTypeKey !== 'http_loadbalancer') {
          showWarning('Diagram generation is only available for HTTP Load Balancers');
          return;
        }

        logger.info(`Generating diagram for ${data.name} in ${data.namespace}`);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Generating diagram for ${data.name}...`,
            cancellable: false,
          },
          async () => {
            await diagramProvider.showDiagram(data.profileName, data.namespace, data.name);
          },
        );
      }, 'Generate diagram');
    }),
  );
}
