// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';

const OLD_SECTION = 'f5xc';
const NEW_SECTION = 'xcsh';
const MIGRATED_KEY = 'xcsh.settingsMigrated';

/**
 * One-time migration: copies user settings from the old f5xc.* namespace
 * to the new xcsh.* namespace after the rebranding.
 *
 * Only runs once per workspace — the MIGRATED_KEY flag prevents re-runs.
 * Copies values without deleting the old keys (VS Code ignores unknown keys).
 */
export async function migrateSettings(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATED_KEY)) {
    return;
  }

  const logger = getLogger();
  const oldConfig = vscode.workspace.getConfiguration(OLD_SECTION);
  const newConfig = vscode.workspace.getConfiguration(NEW_SECTION);
  let count = 0;

  const inspectable = oldConfig as unknown as {
    inspect(key: string): { globalValue?: unknown; workspaceValue?: unknown } | undefined;
  };

  for (const key of Object.keys(oldConfig)) {
    if (key === 'has' || key === 'get' || key === 'update' || key === 'inspect') continue;
    const inspection = inspectable.inspect(key);
    if (!inspection) continue;

    if (inspection.globalValue !== undefined) {
      const newInspection = (newConfig as unknown as typeof inspectable).inspect(key);
      if (!newInspection?.globalValue) {
        await newConfig.update(key, inspection.globalValue, vscode.ConfigurationTarget.Global);
        count++;
      }
    }

    if (inspection.workspaceValue !== undefined) {
      const newInspection = (newConfig as unknown as typeof inspectable).inspect(key);
      if (!newInspection?.workspaceValue) {
        await newConfig.update(key, inspection.workspaceValue, vscode.ConfigurationTarget.Workspace);
        count++;
      }
    }
  }

  await context.globalState.update(MIGRATED_KEY, true);

  if (count > 0) {
    logger.info(`settingsMigration: migrated ${count} settings from ${OLD_SECTION}.* to ${NEW_SECTION}.*`);
    void vscode.window.showInformationMessage(
      vscode.l10n.t('xcsh: {0} settings migrated from f5xc.* to xcsh.* namespace. No action needed.', count),
    );
  }
}
