// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
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
import { F5XCCompletionProvider } from './providers/f5xcCompletionProvider';
import { registerConflictDiagnostics } from './providers/f5xcConflictDiagnosticProvider';
import { F5XCDescribeProvider } from './providers/f5xcDescribeProvider';
import { F5XCFileSystemProvider } from './providers/f5xcFileSystemProvider';
import { F5XCHoverProvider } from './providers/f5xcHoverProvider';
import { F5XCInlineCompletionProvider } from './providers/f5xcInlineCompletionProvider';
import { F5XCSchemaProvider } from './providers/f5xcSchemaProvider';
import { F5XCViewProvider } from './providers/f5xcViewProvider';
import { HealthcheckFormProvider } from './providers/healthcheckFormProvider';
import { OnboardingProvider } from './providers/onboardingProvider';
import { SubscriptionDashboardProvider } from './providers/subscriptionDashboardProvider';
import { registerYamlSchemaContributor } from './providers/yamlSchemaContributor';
import { getSchemaRegistry } from './schema/schemaRegistry';
import { CloudStatusProvider } from './tree/cloudStatusProvider';
import { ContextProvider } from './tree/contextProvider';
import { F5XCExplorerProvider } from './tree/f5xcExplorer';
import { SubscriptionProvider } from './tree/subscriptionProvider';
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
  const explorerProvider = new F5XCExplorerProvider(contextManager, clientFactory);
  const contextProvider = new ContextProvider(contextManager);
  const cloudStatusProvider = new CloudStatusProvider();
  const subscriptionProvider = new SubscriptionProvider(contextManager);
  const cloudStatusDashboardProvider = new CloudStatusDashboardProvider(contextManager);

  // Set context for active context to control view visibility
  const updateHasActiveContext = async () => {
    const hasActive = (await contextManager.getActiveContext()) !== null;
    void vscode.commands.executeCommand('setContext', 'f5xc.hasActiveContext', hasActive);
  };
  void updateHasActiveContext();

  // Initialize F5 XC file system provider for editing resources
  const fsProvider = new F5XCFileSystemProvider(contextManager, () => {
    explorerProvider.refresh();
  });

  // Register the file system provider for editing resources
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('f5xc', fsProvider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

  // Initialize and register the view provider for read-only resource viewing
  const viewProvider = new F5XCViewProvider(contextManager);
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('f5xc-view', viewProvider));

  // Initialize the describe provider for formatted resource descriptions
  const describeProvider = new F5XCDescribeProvider(contextManager);

  // Initialize and register the schema provider for JSON IntelliSense
  const schemaProvider = new F5XCSchemaProvider();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('f5xc-schema', schemaProvider));
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
    const f5xcDocumentSelector: vscode.DocumentSelector = [
      { scheme: 'f5xc', language: 'json' }, // f5xc:// scheme (editing resources)
      { scheme: 'file', language: 'json' }, // All JSON files
    ];

    // Register multi-line completion provider (dropdown completions)
    const completionProvider = new F5XCCompletionProvider();
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        f5xcDocumentSelector,
        completionProvider,
        '"', // Trigger on quote
        '{', // Trigger on opening brace
        ':', // Trigger on colon
      ),
    );

    // Register inline completion provider (ghost text)
    const inlineCompletionProvider = new F5XCInlineCompletionProvider();
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(f5xcDocumentSelector, inlineCompletionProvider),
    );

    // Register hover provider (field documentation on hover)
    const hoverProvider = new F5XCHoverProvider();
    context.subscriptions.push(vscode.languages.registerHoverProvider(f5xcDocumentSelector, hoverProvider));

    logger.info('Completion and hover providers registered successfully');
  } catch (error) {
    logger.error('Failed to register language providers', error as Error);
    // Continue extension activation even if providers fail
  }

  // Register YAML schema contributor for XC manifest intellisense in YAML files
  void registerYamlSchemaContributor(context);

  // Initialize the subscription dashboard provider for Plan and Quotas views
  const subscriptionDashboardProvider = new SubscriptionDashboardProvider(contextManager);

  // Register subscription commands (f5xc.showPlan, f5xc.showQuotas)
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.showPlan', async (contextName?: string) => {
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
    vscode.commands.registerCommand('f5xc.showQuotas', async (contextName?: string) => {
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
    vscode.commands.registerCommand('f5xc.activateAddon', async (addonName: string, contextName?: string) => {
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

  // Register tree views
  const explorerView = vscode.window.createTreeView('f5xc.explorer', {
    treeDataProvider: explorerProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  const contextsView = vscode.window.createTreeView('f5xc.profiles', {
    treeDataProvider: contextProvider,
    showCollapseAll: false,
    canSelectMany: false,
  });

  const cloudStatusView = vscode.window.createTreeView('f5xc.cloudStatus', {
    treeDataProvider: cloudStatusProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  const subscriptionView = vscode.window.createTreeView('f5xc.subscription', {
    treeDataProvider: subscriptionProvider,
    showCollapseAll: false,
    canSelectMany: false,
  });

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.refresh', () => {
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
    vscode.commands.registerCommand('f5xc.createHealthcheckForm', async (arg?: unknown) => {
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
    vscode.commands.registerCommand('f5xc.showOnboarding', async () => {
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

  // Configure JSON schema associations for f5xc:// documents
  // This ensures IntelliSense works when editing F5 XC resources
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.uri.scheme === 'f5xc' && document.uri.path.endsWith('.json')) {
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
  vscode.commands.executeCommand('f5xc.explorer.focus').then(
    () => {
      logger.debug('Focused Resources view (f5xc.explorer) as default');
    },
    (error) => {
      logger.warn('Failed to focus Resources view (f5xc.explorer)', error as Error);
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
