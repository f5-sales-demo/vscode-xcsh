// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { execFile } from 'node:child_process';
import type { ContextManager } from '../config/contextManager';
import { findXcshBinary } from '../xcsh/processManager';

export type IntegrationState = 'connected' | 'unauthenticated' | 'unavailable' | 'unknown';

export interface IntegrationDef {
  id: string;
  name: string;
  category: 'platform' | 'cloud' | 'devtools' | 'ai';
  badge: { label: string; color: string };
  binary?: string;
  installCommand?: string;
  authCheckArgs?: string[];
  authCommand?: string;
}

export interface IntegrationStatus {
  id: string;
  state: IntegrationState;
  command?: string;
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'xcsh',
    name: 'xcsh',
    category: 'platform',
    badge: { label: 'xcsh', color: '#e01f27' },
    binary: 'xcsh',
    installCommand: 'brew install f5xc-salesdemos/tap/xcsh',
  },
  {
    id: 'xcsh',
    name: 'F5 XC Context',
    category: 'platform',
    badge: { label: 'F5', color: '#e01f27' },
  },
  {
    id: 'aws',
    name: 'AWS',
    category: 'cloud',
    badge: { label: 'AWS', color: '#FF9900' },
    binary: 'aws',
    installCommand: 'brew install awscli',
    authCheckArgs: ['sts', 'get-caller-identity'],
    authCommand: 'aws sso login',
  },
  {
    id: 'azure',
    name: 'Azure',
    category: 'cloud',
    badge: { label: 'Az', color: '#0078D4' },
    binary: 'az',
    installCommand: 'brew install azure-cli',
    authCheckArgs: ['account', 'show'],
    authCommand: 'az login',
  },
  {
    id: 'gcp',
    name: 'GCP',
    category: 'cloud',
    badge: { label: 'GCP', color: '#4285F4' },
    binary: 'gcloud',
    installCommand: 'brew install google-cloud-sdk',
    authCheckArgs: ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'],
    authCommand: 'gcloud auth login',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'devtools',
    badge: { label: 'GH', color: '#24292e' },
    binary: 'gh',
    installCommand: 'brew install gh',
    authCheckArgs: ['auth', 'status'],
    authCommand: 'gh auth login',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    category: 'devtools',
    badge: { label: 'GL', color: '#FC6D26' },
    binary: 'glab',
    installCommand: 'brew install glab',
    authCheckArgs: ['auth', 'status'],
    authCommand: 'glab auth login',
  },
  {
    id: 'terraform',
    name: 'Terraform',
    category: 'devtools',
    badge: { label: 'TF', color: '#7B42BC' },
    binary: 'terraform',
    installCommand: 'brew install terraform',
    authCheckArgs: ['version'],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    category: 'devtools',
    badge: { label: 'SF', color: '#00A1E0' },
    binary: 'sf',
    installCommand: 'brew install sf',
    authCheckArgs: ['org', 'list'],
    authCommand: 'sf org login web',
  },
  {
    id: 'ai-model',
    name: 'AI Model',
    category: 'ai',
    badge: { label: 'AI', color: '#6B46C1' },
  },
];

const CHECK_TIMEOUT_MS = 5_000;

function execCheck(binary: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(binary, args, { timeout: CHECK_TIMEOUT_MS }, (error) => {
      resolve(!error);
    });
    child.stdin?.end();
  });
}

function findBinary(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [name], { timeout: CHECK_TIMEOUT_MS }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function detectOne(def: IntegrationDef, contextManager: ContextManager): Promise<IntegrationStatus> {
  if (def.id === 'xcsh') {
    const ctx = await contextManager.getActiveContext();
    if (ctx) {
      return { id: def.id, state: 'connected' };
    }
    return { id: def.id, state: 'unauthenticated', command: undefined };
  }

  if (def.id === 'ai-model') {
    return { id: def.id, state: 'unknown' };
  }

  if (def.id === 'xcsh') {
    const binary = await new Promise<string | null>((resolve) => {
      setImmediate(() => {
        resolve(findXcshBinary(undefined));
      });
    });
    if (!binary) {
      return { id: def.id, state: 'unavailable', command: def.installCommand };
    }
    return { id: def.id, state: 'connected' };
  }

  if (!def.binary) {
    return { id: def.id, state: 'unknown' };
  }

  const binaryPath = await findBinary(def.binary);
  if (!binaryPath) {
    return { id: def.id, state: 'unavailable', command: def.installCommand };
  }

  if (!def.authCheckArgs) {
    return { id: def.id, state: 'connected' };
  }

  const authOk = await execCheck(binaryPath, def.authCheckArgs);
  if (authOk) {
    return { id: def.id, state: 'connected' };
  }

  return { id: def.id, state: 'unauthenticated', command: def.authCommand };
}

export async function detectAll(contextManager: ContextManager): Promise<IntegrationStatus[]> {
  return Promise.all(INTEGRATIONS.map((def) => detectOne(def, contextManager)));
}
