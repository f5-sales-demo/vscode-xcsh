// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { probeOptionalF5Cli, runCapabilityCommand } from '../../xcsh/nativeCliCapabilities';

const baseline = ['bundled-validation', 'bundled-planning'];
const negotiate = (candidate: unknown) => ({ compatible: candidate === 'compatible', capabilities: baseline });

describe('optional native F5 CLI enrichment', () => {
  it('preserves the bundled baseline when no CLI is installed', async () => {
    const runner = jest.fn();
    expect(await probeOptionalF5Cli(undefined, negotiate, { timeoutMs: 5000 }, runner)).toEqual({
      state: 'unavailable',
      negotiation: { compatible: false, capabilities: baseline },
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it('never sends an unknown subcommand to an older CLI', async () => {
    const runner = jest.fn().mockResolvedValue('COMMANDS\n  launch    Start chat\n');
    expect((await probeOptionalF5Cli('synthetic-cli', negotiate, { timeoutMs: 5000 }, runner)).state).toBe(
      'incompatible',
    );
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith('synthetic-cli', ['--help'], { timeoutMs: 5000 });
  });

  it.each(['"compatible"', '"incompatible"', '{"version":999}', 'not json'])(
    'negotiates %s without changing bundled capabilities',
    async (response) => {
      const runner = jest
        .fn()
        .mockResolvedValueOnce('COMMANDS\n  f5-core         Capability contract\n')
        .mockResolvedValueOnce(response);
      const result = await probeOptionalF5Cli('synthetic-cli', negotiate, { timeoutMs: 5000 }, runner);
      expect(result.negotiation.capabilities).toBe(baseline);
      expect(result.state).toBe(
        response === '"compatible"' ? 'compatible' : response === 'not json' ? 'unavailable' : 'incompatible',
      );
      expect(runner).toHaveBeenLastCalledWith('synthetic-cli', ['f5-core', 'capabilities', '--json'], {
        timeoutMs: 5000,
      });
    },
  );

  it('drops failures and late responses after cancellation', async () => {
    const failed = jest.fn().mockRejectedValue(new Error('synthetic-private-path'));
    expect((await probeOptionalF5Cli('synthetic-cli', negotiate, { timeoutMs: 5000 }, failed)).state).toBe(
      'unavailable',
    );
    const controller = new AbortController();
    const runner = jest.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve('COMMANDS\n  f5-core         Capability contract\n');
    });
    const result = await probeOptionalF5Cli(
      'synthetic-cli',
      negotiate,
      { timeoutMs: 5000, signal: controller.signal },
      runner,
    );
    expect(result).toEqual({ state: 'unavailable', negotiation: { compatible: false, capabilities: baseline } });
    expect(runner).toHaveBeenCalledTimes(1);
  });
});

it('does not pass context or unrelated credential variables to the optional process', async () => {
  const previous = process.env.XCSH_API_TOKEN;
  process.env.XCSH_API_TOKEN = 'synthetic-private-value';
  try {
    const result = await runCapabilityCommand(
      process.execPath,
      ['-e', 'process.stdout.write(JSON.stringify({hasCredential:process.env.XCSH_API_TOKEN!==undefined}))'],
      { timeoutMs: 5000 },
    );
    expect(JSON.parse(result)).toEqual({ hasCredential: false });
  } finally {
    if (previous === undefined) {
      delete process.env.XCSH_API_TOKEN;
    } else {
      process.env.XCSH_API_TOKEN = previous;
    }
  }
});

it('retains the baseline when the actual subprocess cannot start', async () => {
  const result = await probeOptionalF5Cli('/xcsh-synthetic-absent/capability-test', negotiate, { timeoutMs: 1000 });
  expect(result).toEqual({ state: 'unavailable', negotiation: { compatible: false, capabilities: baseline } });
});
