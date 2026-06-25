// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { createAddonSubscription, deleteAddonSubscription } from './api/subscription';
import { registerCloudStatusCommands } from './commands/cloudStatus';
import { registerContextCommands } from './commands/context';
import { registerCrudCommands } from './commands/crud';
import { registerDiagramCommands } from './commands/diagram';
import { registerExportCommands } from './commands/exportResource';
import { registerFileOperationCommands } from './commands/fileOperations';
import { registerObservabilityCommands } from './commands/observability';
import { ContextManager } from './config/contextManager';
import { migrateProfilesToContexts } from './config/contextMigration';
import { CloudStatusDashboardProvider } from './providers/cloudStatusDashboardProvider';
import { HealthcheckFormProvider } from './providers/healthcheckFormProvider';
import { OnboardingProvider } from './providers/onboardingProvider';
import { SubscriptionDashboardProvider } from './providers/subscriptionDashboardProvider';
import { XCSHCodeActionProvider } from './providers/xcshCodeActionProvider';
import { XCSHCompletionProvider } from './providers/xcshCompletionProvider';
import { registerConflictDiagnostics } from './providers/xcshConflictDiagnosticProvider';
import { XCSHDescribeProvider } from './providers/xcshDescribeProvider';
import { XCSHFileSystemProvider } from './providers/xcshFileSystemProvider';
import { XCSHHoverProvider } from './providers/xcshHoverProvider';
import { XCSHSchemaProvider } from './providers/xcshSchemaProvider';
import { XCSHViewProvider } from './providers/xcshViewProvider';
import { registerYamlSchemaContributor } from './providers/yamlSchemaContributor';
import { getSchemaRegistry } from './schema/schemaRegistry';
import { CloudStatusProvider } from './tree/cloudStatusProvider';
import { ContextProvider } from './tree/contextProvider';
import { SubscriptionProvider } from './tree/subscriptionProvider';
import type { AddonNodeData } from './tree/treeTypes';
import { XCSHExplorerProvider } from './tree/xcshExplorer';
import { getLogger, type Logger } from './utils/logger';
import { ManifestDetector } from './utils/manifestDetector';
import { activateXcsh } from './xcsh/index';

let logger: Logger;

export function activate(context: vscode.ExtensionContext): void {
  logger = getLogger();
  logger.info('xcsh extension is activating...');

  // Run one-time profile-to-context migration
  const migrationResult = migrateProfilesToContexts();
  if (migrationResult.migrated > 0) {
    logger.info(`Migrated ${migrationResult.migrated} profiles to contexts`);
  }

  // Initialize context manager with file-based storage
  const contextManager = new ContextManager();
  contextManager.initFileWatcher();
  context.subscriptions.push(contextManager);

  // Client factory for creating API clients
  const clientFactory = (ctx: { apiUrl: string; name: string }) => {
    return contextManager.getClient(ctx.name);
  };

  // Initialize tree view providers
  const explorerProvider = new XCSHExplorerProvider(contextManager, clientFactory);
  const contextProvider = new ContextProvider(contextManager);
  const cloudStatusProvider = new CloudStatusProvider();
  const subscriptionProvider = new SubscriptionProvider(contextManager);
  const cloudStatusDashboardProvider = new CloudStatusDashboardProvider(contextManager);

  // Set context for active context to control view visibility
  const updateHasActiveContext = async () => {
    const hasActive = (await contextManager.getActiveContext()) !== null;
    void vscode.commands.executeCommand('setContext', 'xcsh.hasActiveContext', hasActive);
  };
  void updateHasActiveContext();

  // Initialize F5 XC file system provider for editing resources
  const fsProvider = new XCSHFileSystemProvider(contextManager, () => {
    explorerProvider.refresh();
  });

  // Register the file system provider for editing resources
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('xcsh', fsProvider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

  // Initialize and register the view provider for read-only resource viewing
  const viewProvider = new XCSHViewProvider(contextManager);
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('xcsh-view', viewProvider));

  // Initialize the describe provider for formatted resource descriptions
  const describeProvider = new XCSHDescribeProvider(contextManager);

  // Initialize and register the schema provider for JSON IntelliSense
  const schemaProvider = new XCSHSchemaProvider();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('xcsh-schema', schemaProvider));
  logger.debug('Schema provider registered');

  // Pre-warm schema cache for commonly used resource types
  const schemaRegistry = getSchemaRegistry();
  schemaRegistry.prewarmCache(['http_loadbalancer', 'origin_pool', 'healthcheck', 'app_firewall']);
  const cacheStats = schemaRegistry.getCacheStats();
  logger.debug(`Schema cache: ${cacheStats.cachedCount}/${cacheStats.availableCount}`);

  // Register completion providers for enhanced IntelliSense
  try {
    logger.info('Registering completion providers');

    // Document selectors for F5 XC JSON files
    const xcshDocumentSelector: vscode.DocumentSelector = [
      { scheme: 'xcsh', language: 'json' }, // xcsh:// scheme (editing resources)
      { scheme: 'file', language: 'json' }, // All JSON files
    ];

    // Register multi-line completion provider (dropdown completions)
    const completionProvider = new XCSHCompletionProvider();
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        xcshDocumentSelector,
        completionProvider,
        '"', // Trigger on quote
        '{', // Trigger on opening brace
        ':', // Trigger on colon
      ),
    );

    // Register hover provider (field documentation on hover)
    const hoverProvider = new XCSHHoverProvider();
    context.subscriptions.push(vscode.languages.registerHoverProvider(xcshDocumentSelector, hoverProvider));

    // Register code action provider (quick fixes for conflicts)
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(xcshDocumentSelector, new XCSHCodeActionProvider(), {
        providedCodeActionKinds: XCSHCodeActionProvider.providedCodeActionKinds,
      }),
    );

    logger.info('Completion and hover providers registered successfully');
  } catch (error) {
    logger.error('Failed to register language providers', error as Error);
    // Continue extension activation even if providers fail
  }

  // Register YAML schema contributor for XC manifest intellisense in YAML files
  void registerYamlSchemaContributor(context);

  // Initialize the subscription dashboard provider for Plan and Quotas views
  const subscriptionDashboardProvider = new SubscriptionDashboardProvider(contextManager);

  // Register subscription commands (xcsh.showPlan, xcsh.showQuotas)
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.showPlan', async (contextName?: string) => {
      const activeContext = await contextManager.getActiveContext();
      const name = contextName || activeContext?.name;
      if (name) {
        void subscriptionDashboardProvider.showPlan(name);
      } else {
        void vscode.window.showWarningMessage(vscode.l10n.t('No active context selected'));
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.showQuotas', async (contextName?: string) => {
      const activeContext = await contextManager.getActiveContext();
      const name = contextName || activeContext?.name;
      if (name) {
        void subscriptionDashboardProvider.showQuotas(name);
      } else {
        void vscode.window.showWarningMessage(vscode.l10n.t('No active context selected'));
      }
    }),
  );

  // Register addon activation command (for programmatic access)
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.activateAddon', async (addonName: string, contextName?: string) => {
      const activeContext = await contextManager.getActiveContext();
      const name = contextName || activeContext?.name;
      if (!name) {
        void vscode.window.showWarningMessage(vscode.l10n.t('No active context selected'));
        return;
      }
      if (!addonName) {
        void vscode.window.showWarningMessage(vscode.l10n.t('Addon name is required'));
        return;
      }
      // Show the plan dashboard which handles activation
      await subscriptionDashboardProvider.showPlan(name);
      void vscode.window.showInformationMessage(
        vscode.l10n.t('To activate "{0}", click the Activate button in the Plan dashboard.', addonName),
      );
    }),
  );

  // Subscribe to an add-on from the Platform & Add-ons tree (mutates tenant-wide platform state).
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.subscribeAddon', async (node?: { getData?: () => AddonNodeData }) => {
      const data = node?.getData?.();
      if (!data) {
        return;
      }
      const yes = vscode.l10n.t('Subscribe');
      const confirm = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Subscribe to add-on "{0}"?\n\nThis enables a tenant-wide platform service and may require approval from F5 support.',
          data.displayName,
        ),
        { modal: true },
        yes,
      );
      if (confirm !== yes) {
        return;
      }
      try {
        const client = await contextManager.getClient(data.profileName);
        await createAddonSubscription(client, data.name, 'system');
        void vscode.window.showInformationMessage(
          vscode.l10n.t('Subscription requested for "{0}" (pending approval).', data.displayName),
        );
        explorerProvider.refresh();
      } catch (error) {
        void vscode.window.showErrorMessage(
          vscode.l10n.t('Failed to subscribe to add-on: {0}', (error as Error).message),
        );
      }
    }),
  );

  // Unsubscribe from an add-on (mutates tenant-wide platform state).
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.unsubscribeAddon', async (node?: { getData?: () => AddonNodeData }) => {
      const data = node?.getData?.();
      if (!data) {
        return;
      }
      const yes = vscode.l10n.t('Unsubscribe');
      const confirm = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Unsubscribe from add-on "{0}"?\n\nThis disables a tenant-wide platform service for the whole tenant.',
          data.displayName,
        ),
        { modal: true },
        yes,
      );
      if (confirm !== yes) {
        return;
      }
      try {
        const client = await contextManager.getClient(data.profileName);
        await deleteAddonSubscription(client, data.name, 'system');
        void vscode.window.showInformationMessage(vscode.l10n.t('Unsubscribed from "{0}".', data.displayName));
        explorerProvider.refresh();
      } catch (error) {
        void vscode.window.showErrorMessage(
          vscode.l10n.t('Failed to unsubscribe from add-on: {0}', (error as Error).message),
        );
      }
    }),
  );

  // Register tree views
  const explorerView = vscode.window.createTreeView('xcsh.explorer', {
    treeDataProvider: explorerProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  const contextsView = vscode.window.createTreeView('xcsh.profiles', {
    treeDataProvider: contextProvider,
    showCollapseAll: false,
    canSelectMany: false,
  });

  const cloudStatusView = vscode.window.createTreeView('xcsh.cloudStatus', {
    treeDataProvider: cloudStatusProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  const subscriptionView = vscode.window.createTreeView('xcsh.subscription', {
    treeDataProvider: subscriptionProvider,
    showCollapseAll: false,
    canSelectMany: false,
  });

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.refresh', () => {
      explorerProvider.refresh();
      logger.info('Explorer refreshed');
    }),
  );

  // Register context commands
  registerContextCommands(context, contextManager, contextProvider, explorerProvider);

  // Register CRUD commands
  registerCrudCommands(context, explorerProvider, contextManager, fsProvider, viewProvider, describeProvider);

  // Register observability commands
  registerObservabilityCommands(context, contextManager);

  // Register diagram commands
  registerDiagramCommands(context, contextManager);

  // Register export commands (Export as JSON/YAML from explorer)
  registerExportCommands(context, explorerProvider, contextManager);

  // Register file-based operation commands (Apply/Create/Diff/Delete from file explorer)
  registerFileOperationCommands(context, explorerProvider, contextManager);

  // Register manifest detector for file-based operations context key
  const manifestDetector = new ManifestDetector();
  context.subscriptions.push(manifestDetector);

  // Register cloud status commands
  registerCloudStatusCommands(context, cloudStatusProvider, cloudStatusDashboardProvider);

  // Register healthcheck form provider
  const healthcheckFormProvider = new HealthcheckFormProvider(contextManager, explorerProvider, describeProvider);
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.createHealthcheckForm', async (arg?: unknown) => {
      // Extract namespace from context if available
      let namespace: string | undefined;
      if (arg && typeof arg === 'object' && 'getData' in arg) {
        const nodeData = (arg as { getData: () => { namespace?: string } }).getData();
        namespace = nodeData.namespace;
      }
      await healthcheckFormProvider.show(namespace);
    }),
  );

  // Register onboarding / platform readiness panel
  const onboardingProvider = new OnboardingProvider(contextManager);
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.showOnboarding', async () => {
      await onboardingProvider.showPanel();
      void context.globalState.update('onboarding.shown', true);
    }),
  );

  // Auto-open onboarding panel when integrations need attention
  onboardingProvider.shouldAutoOpen(context.globalState).then(
    (shouldOpen) => {
      if (shouldOpen) {
        void onboardingProvider.showPanel();
        void context.globalState.update('onboarding.shown', true);
      }
    },
    (error) => {
      logger.warn('Onboarding auto-open check failed', error as Error);
    },
  );

  // Configure JSON schema associations for xcsh:// documents
  // This ensures IntelliSense works when editing F5 XC resources
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.uri.scheme === 'xcsh' && document.uri.path.endsWith('.json')) {
        // Ensure the document is treated as JSON
        void vscode.languages.setTextDocumentLanguage(document, 'json');
      }
    }),
  );

  // Register views
  context.subscriptions.push(explorerView);
  context.subscriptions.push(contextsView);
  context.subscriptions.push(cloudStatusView);
  context.subscriptions.push(subscriptionView);

  // Ensure the Resources view is the default focused view on initial activation
  vscode.commands.executeCommand('xcsh.explorer.focus').then(
    () => {
      logger.debug('Focused Resources view (xcsh.explorer) as default');
    },
    (error) => {
      logger.warn('Failed to focus Resources view (xcsh.explorer)', error as Error);
    },
  );

  // Listen for context changes
  contextManager.onDidChangeContext(() => {
    contextProvider.refresh();
    explorerProvider.refresh();
    subscriptionProvider.refresh();
    void updateHasActiveContext();
  });

  // Activate xcsh shell assistant integration
  void activateXcsh(context, contextManager);

  // Register conflict diagnostics provider
  registerConflictDiagnostics(context);

  logger.info('xcsh extension activated successfully');
}

export function deactivate(): void {
  logger?.info('xcsh extension deactivated');
}
