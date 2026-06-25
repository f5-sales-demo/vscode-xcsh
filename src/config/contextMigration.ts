// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '../utils/logger';
import {
  DIR_MODE,
  FILE_MODE,
  getActiveContextPath,
  getActiveProfilePath,
  getContextPath,
  getContextsDir,
  getProfilesDir,
} from './contextPaths';
import { CURRENT_SCHEMA_VERSION } from './contextTypes';

export interface MigrationResult {
  migrated: number;
  skipped: number;
  skippedNames: string[];
  skippedReason?: string;
}

/**
 * One-time migration: converts old profile files (~/.config/xcsh/profiles/)
 * to the new context format (~/.config/xcsh/contexts/).
 *
 * Rules:
 *  - If the contexts dir already contains .json files → skip (xcsh is configured).
 *  - If the profiles dir does not exist → nothing to migrate.
 *  - Token-based profiles (apiToken field, no cert fields) are converted.
 *  - Certificate-based profiles (p12Bundle / cert / key) are skipped.
 *  - active_profile is copied to active_context when the named profile was migrated.
 */
export function migrateProfilesToContexts(): MigrationResult {
  const logger = getLogger();
  const contextsDir = getContextsDir();
  const profilesDir = getProfilesDir();

  // ── 1. Skip if contexts dir already has files ─────────────────────────────
  if (fs.existsSync(contextsDir)) {
    const existing = fs.readdirSync(contextsDir).filter((f) => f.endsWith('.json'));
    if (existing.length > 0) {
      logger.info('contextMigration: contexts dir already has files — skipping migration');
      return { migrated: 0, skipped: 0, skippedNames: [], skippedReason: 'contexts_exist' };
    }
  }

  // ── 2. Nothing to do if profiles dir does not exist ───────────────────────
  if (!fs.existsSync(profilesDir)) {
    logger.info('contextMigration: no profiles directory found — nothing to migrate');
    return { migrated: 0, skipped: 0, skippedNames: [] };
  }

  // ── 3. Read all profile JSON files ────────────────────────────────────────
  const profileFiles = fs.readdirSync(profilesDir).filter((f) => f.endsWith('.json'));

  let migrated = 0;
  let skipped = 0;
  const skippedNames: string[] = [];
  const migratedNames: string[] = [];

  for (const file of profileFiles) {
    const name = path.basename(file, '.json');

    let raw: string;
    try {
      raw = fs.readFileSync(path.join(profilesDir, file), 'utf-8');
    } catch (err) {
      logger.warn(`contextMigration: could not read profile ${file}`, err);
      skipped++;
      skippedNames.push(name);
      continue;
    }

    let profile: Record<string, unknown>;
    try {
      profile = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      logger.warn(`contextMigration: malformed JSON in profile ${file}`, err);
      skipped++;
      skippedNames.push(name);
      continue;
    }

    // Skip certificate-based profiles
    if (profile.p12Bundle || profile.cert || profile.key) {
      logger.info(`contextMigration: skipping cert-based profile "${name}"`);
      skipped++;
      skippedNames.push(name);
      continue;
    }

    // Convert to context format
    const context = {
      ...profile,
      name,
      version: CURRENT_SCHEMA_VERSION,
      metadata: {
        ...(typeof profile.metadata === 'object' && profile.metadata !== null
          ? (profile.metadata as Record<string, unknown>)
          : {}),
        createdAt: new Date().toISOString(),
      },
    };

    // Ensure contexts directory exists
    if (!fs.existsSync(contextsDir)) {
      fs.mkdirSync(contextsDir, { recursive: true, mode: DIR_MODE });
    }

    // Atomic write: temp file + rename
    const ctxPath = getContextPath(name);
    const tmpPath = `${ctxPath}.tmp`;
    try {
      fs.writeFileSync(tmpPath, `${JSON.stringify(context, null, 2)}\n`, {
        encoding: 'utf-8',
        mode: FILE_MODE,
      });
      fs.renameSync(tmpPath, ctxPath);
      try {
        fs.chmodSync(ctxPath, FILE_MODE);
      } catch {
        // Windows may not support chmod
      }
      migrated++;
      migratedNames.push(name);
      logger.info(`contextMigration: migrated profile "${name}" → context`);
    } catch (err) {
      logger.warn(`contextMigration: failed to write context for "${name}"`, err);
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
      skipped++;
      skippedNames.push(name);
    }
  }

  // ── 4. Copy active_profile → active_context ───────────────────────────────
  const activeProfilePath = getActiveProfilePath();
  if (fs.existsSync(activeProfilePath)) {
    try {
      const activeProfileName = fs.readFileSync(activeProfilePath, 'utf-8').trim();
      if (activeProfileName && migratedNames.includes(activeProfileName)) {
        const activeCtxPath = getActiveContextPath();
        const tmpActive = `${activeCtxPath}.tmp`;
        fs.writeFileSync(tmpActive, `${activeProfileName}\n`, {
          encoding: 'utf-8',
          mode: FILE_MODE,
        });
        fs.renameSync(tmpActive, activeCtxPath);
        try {
          fs.chmodSync(activeCtxPath, FILE_MODE);
        } catch {
          // Windows
        }
        logger.info(`contextMigration: active_context set to "${activeProfileName}"`);
      }
    } catch (err) {
      logger.warn('contextMigration: could not copy active_profile to active_context', err);
    }
  }

  return { migrated, skipped, skippedNames };
}
