// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as os from 'node:os';
import * as path from 'node:path';

export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

export function getConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'xcsh');
  }
  if (os.platform() === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'xcsh');
  }
  return path.join(os.homedir(), '.config', 'xcsh');
}

export function getContextsDir(): string {
  return path.join(getConfigDir(), 'contexts');
}

export function getContextPath(name: string): string {
  return path.join(getContextsDir(), `${name}.json`);
}

export function getActiveContextPath(): string {
  return path.join(getConfigDir(), 'active_context');
}

export function getProfilesDir(): string {
  return path.join(getConfigDir(), 'profiles');
}

export function getActiveProfilePath(): string {
  return path.join(getConfigDir(), 'active_profile');
}

export function getLocalContextsDir(workspaceFolder: string): string {
  return path.join(workspaceFolder, '.xcsh', 'contexts');
}

export function getLocalActiveContextPath(workspaceFolder: string): string {
  return path.join(getLocalContextsDir(workspaceFolder), 'active_context');
}

export function getLocalContextPath(name: string, workspaceFolder: string): string {
  return path.join(getLocalContextsDir(workspaceFolder), `${name}.json`);
}
