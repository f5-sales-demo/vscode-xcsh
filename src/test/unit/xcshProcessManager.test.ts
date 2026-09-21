// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

jest.mock('node:child_process');
jest.mock('node:fs');

const mockedExecFileSync = childProcess.execFileSync as jest.MockedFunction<typeof childProcess.execFileSync>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockedSpawn = childProcess.spawn as jest.MockedFunction<typeof childProcess.spawn>;

// Must import after mocks are set up
import { findXcshBinary } from '../../xcsh/processManager';

describe('findXcshBinary', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default: nothing exists
    mockedExistsSync.mockReturnValue(false);
  });

  it('returns user-configured path when it exists', () => {
    const userPath = '/custom/path/to/xcsh';
    mockedExistsSync.mockImplementation((p) => p === userPath);

    const result = findXcshBinary(userPath);
    expect(result).toBe(userPath);
  });

  it('returns null when user-configured path does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = findXcshBinary('/nonexistent/xcsh');
    expect(result).toBeNull();
  });

  it('finds xcsh on PATH via which', () => {
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'which' && args?.[0] === 'xcsh') {
        return '/usr/local/bin/xcsh\n';
      }
      throw new Error('not found');
    });
    mockedExistsSync.mockImplementation((p) => p === '/usr/local/bin/xcsh');

    const result = findXcshBinary();
    expect(result).toBe('/usr/local/bin/xcsh');
    expect(mockedExecFileSync).toHaveBeenCalledWith('which', ['xcsh'], expect.any(Object));
  });

  it('falls back to homebrew path', () => {
    // which fails
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    // homebrew path exists
    mockedExistsSync.mockImplementation((p) => p === '/opt/homebrew/bin/xcsh');

    const result = findXcshBinary();
    expect(result).toBe('/opt/homebrew/bin/xcsh');
  });

  it('falls back to /usr/local/bin/xcsh when /opt/homebrew is missing', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    mockedExistsSync.mockImplementation((p) => p === '/usr/local/bin/xcsh');

    const result = findXcshBinary();
    expect(result).toBe('/usr/local/bin/xcsh');
  });

  it('falls back to npm global bin', () => {
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'npm' && args?.[0] === 'root' && args?.[1] === '-g') {
        return '/usr/local/lib/node_modules\n';
      }
      throw new Error('not found');
    });
    const expectedPath = path.join('/usr/local/lib/node_modules', '.bin', 'xcsh');
    mockedExistsSync.mockImplementation((p) => p === expectedPath);

    const result = findXcshBinary();
    expect(result).toBe(expectedPath);
  });

  it('returns null when xcsh is not found anywhere', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    mockedExistsSync.mockReturnValue(false);

    const result = findXcshBinary();
    expect(result).toBeNull();
  });
});

import * as vscode from 'vscode';
import { XcshProcessManager } from '../../xcsh/processManager';

describe('XcshProcessManager', () => {
  let manager: XcshProcessManager;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedExistsSync.mockReturnValue(false);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: jest.fn() });
    manager = new XcshProcessManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('passes cwd to spawn when setCwd is called before start', async () => {
    const mockProcess = {
      on: jest.fn(),
      stdin: { write: jest.fn() },
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      kill: jest.fn(),
      exitCode: null,
    };
    mockedSpawn.mockReturnValue(mockProcess as unknown as childProcess.ChildProcess);
    mockedExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'which') {
        return '/usr/local/bin/xcsh\n';
      }
      throw new Error('not found');
    });
    mockedExistsSync.mockImplementation((p) => p === '/usr/local/bin/xcsh');

    manager.setCwd('/Users/user/project');
    await manager.start();

    expect(mockedSpawn).toHaveBeenCalledWith(
      '/usr/local/bin/xcsh',
      ['--mode', 'rpc'],
      expect.objectContaining({ cwd: '/Users/user/project' }),
    );
  });

  it('passes undefined cwd to spawn when setCwd is not called', async () => {
    const mockProcess = {
      on: jest.fn(),
      stdin: { write: jest.fn() },
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      kill: jest.fn(),
      exitCode: null,
    };
    mockedSpawn.mockReturnValue(mockProcess as unknown as childProcess.ChildProcess);
    mockedExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'which') {
        return '/usr/local/bin/xcsh\n';
      }
      throw new Error('not found');
    });
    mockedExistsSync.mockImplementation((p) => p === '/usr/local/bin/xcsh');

    await manager.start();

    expect(mockedSpawn).toHaveBeenCalledWith(
      '/usr/local/bin/xcsh',
      ['--mode', 'rpc'],
      expect.objectContaining({ cwd: undefined }),
    );
  });

  it('updates cwd when setCwd is called again', async () => {
    manager.setCwd('/first/path');
    manager.setCwd('/second/path');

    const mockProcess = {
      on: jest.fn(),
      stdin: { write: jest.fn() },
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      kill: jest.fn(),
      exitCode: null,
    };
    mockedSpawn.mockReturnValue(mockProcess as unknown as childProcess.ChildProcess);
    mockedExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'which') {
        return '/usr/local/bin/xcsh\n';
      }
      throw new Error('not found');
    });
    mockedExistsSync.mockImplementation((p) => p === '/usr/local/bin/xcsh');

    await manager.start();

    expect(mockedSpawn).toHaveBeenCalledWith(
      '/usr/local/bin/xcsh',
      ['--mode', 'rpc'],
      expect.objectContaining({ cwd: '/second/path' }),
    );
  });

  it('removes inherited Herdr values and overlays only freshly resolved context', async () => {
    const mockProcess = {
      on: jest.fn(),
      stdin: { write: jest.fn() },
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      kill: jest.fn(),
      exitCode: null,
    };
    mockedSpawn.mockReturnValue(mockProcess as unknown as childProcess.ChildProcess);
    mockedExecFileSync.mockReturnValue('/usr/local/bin/xcsh\n');
    mockedExistsSync.mockImplementation((p) => p === '/usr/local/bin/xcsh');
    const oldCapability = process.env.HERDR_CONTEXT_CAPABILITY;
    const oldSocket = process.env.HERDR_SOCKET_PATH;
    process.env.HERDR_CONTEXT_CAPABILITY = 'must-not-leak';
    process.env.HERDR_SOCKET_PATH = '/stale.sock';
    manager.setEnvironmentResolver(() =>
      Promise.resolve({
        HERDR_ENV: '1',
        HERDR_SOCKET_PATH: '/fresh.sock',
        HERDR_PANE_ID: 'w1:p2',
      }),
    );
    try {
      await manager.start();
      const options = mockedSpawn.mock.calls[0]?.[2];
      expect(options?.env).toMatchObject({
        HERDR_ENV: '1',
        HERDR_SOCKET_PATH: '/fresh.sock',
        HERDR_PANE_ID: 'w1:p2',
      });
      expect(options?.env).not.toHaveProperty('HERDR_CONTEXT_CAPABILITY');
    } finally {
      if (oldCapability === undefined) {
        delete process.env.HERDR_CONTEXT_CAPABILITY;
      } else {
        process.env.HERDR_CONTEXT_CAPABILITY = oldCapability;
      }
      if (oldSocket === undefined) {
        delete process.env.HERDR_SOCKET_PATH;
      } else {
        process.env.HERDR_SOCKET_PATH = oldSocket;
      }
    }
  });

  it('resolves fresh context and waits for the old worker before replacement', async () => {
    const exitListeners: Array<() => void> = [];
    const firstProcessState = {
      on: jest.fn((event: string, listener: () => void): void => {
        if (event === 'exit') {
          exitListeners.push(listener);
        }
      }),
      once: jest.fn((event: string, listener: () => void): void => {
        if (event === 'exit') {
          exitListeners.push(listener);
        }
      }),
      kill: jest.fn(),
      exitCode: null as number | null,
      pid: 101,
    };
    const secondProcessState = {
      on: jest.fn().mockReturnThis(),
      once: jest.fn().mockReturnThis(),
      kill: jest.fn(),
      exitCode: null,
      pid: undefined,
    };
    const firstProcess = firstProcessState as unknown as childProcess.ChildProcess;
    const secondProcess = secondProcessState as unknown as childProcess.ChildProcess;
    mockedSpawn.mockReturnValueOnce(firstProcess).mockReturnValueOnce(secondProcess);
    mockedExecFileSync.mockReturnValue('/usr/local/bin/xcsh\n');
    mockedExistsSync.mockImplementation((p) => p === '/usr/local/bin/xcsh');
    const resolveEnvironment = jest
      .fn()
      .mockResolvedValueOnce({ HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1' })
      .mockResolvedValueOnce({ HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p2' });
    manager.setEnvironmentResolver(resolveEnvironment);

    await manager.start();
    const restart = manager.restart();
    await Promise.resolve();
    await Promise.resolve();

    expect(firstProcessState.kill).toHaveBeenCalledWith('SIGTERM');
    expect(mockedSpawn).toHaveBeenCalledTimes(1);

    firstProcessState.exitCode = 0;
    for (const listener of exitListeners) {
      listener();
    }
    await restart;

    expect(mockedSpawn).toHaveBeenCalledTimes(2);
    expect(resolveEnvironment).toHaveBeenCalledTimes(2);
    expect(mockedSpawn.mock.calls[1]?.[2]?.env).toMatchObject({
      HERDR_ENV: '1',
      HERDR_PANE_ID: 'w1:p2',
    });
  });
});
