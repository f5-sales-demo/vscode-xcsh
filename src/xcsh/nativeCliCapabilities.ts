// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { execFile } from 'node:child_process';

export interface CapabilityCommandOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}
export type CapabilityCommandRunner = (
  executable: string,
  args: readonly string[],
  options: CapabilityCommandOptions,
) => Promise<string>;

/** Capability queries never receive the editor's context or credential environment. */
export const runCapabilityCommand: CapabilityCommandRunner = (executable, args, options) =>
  new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG']) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }
    execFile(
      executable,
      [...args],
      { env, timeout: options.timeoutMs, maxBuffer: 64 * 1024, windowsHide: true, signal: options.signal },
      (error, stdout) => {
        if (error) {
          reject(new Error('CLI_CAPABILITY_UNAVAILABLE', { cause: error }));
        } else {
          resolve(stdout);
        }
      },
    );
  });

/**
 * Keep the bundled negotiation result for every failure. Probe --help first so
 * an older CLI cannot treat an unknown subcommand as a natural-language request.
 * The executable comes from host configuration, never from model tool input.
 */
export async function probeOptionalF5Cli<T extends { compatible: boolean }>(
  executable: string | undefined,
  negotiate: (candidate: unknown) => T,
  options: CapabilityCommandOptions,
  runner: CapabilityCommandRunner = runCapabilityCommand,
): Promise<{ state: 'unavailable' | 'incompatible' | 'compatible'; negotiation: T }> {
  const fallback = { state: 'unavailable' as const, negotiation: negotiate(undefined) };
  if (!executable || options.signal?.aborted) {
    return fallback;
  }
  try {
    const help = await runner(executable, ['--help'], options);
    if (!/^\s*f5-core\s{2,}\S/m.test(help)) {
      return { ...fallback, state: 'incompatible' };
    }
    if (options.signal?.aborted) {
      return fallback;
    }
    const response = await runner(executable, ['f5-core', 'capabilities', '--json'], options);
    if (options.signal?.aborted) {
      return fallback;
    }
    const negotiation = negotiate(JSON.parse(response) as unknown);
    return { state: negotiation.compatible ? 'compatible' : 'incompatible', negotiation };
  } catch {
    // Subprocess output can contain private paths; it is neither logged nor sent
    // to the model. The optional CLI cannot replace bundled functionality.
    return fallback;
  }
}
