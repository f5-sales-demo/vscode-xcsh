// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

jest.mock('node:child_process');
jest.mock('node:fs');

const mockedExecFileSync = childProcess.execFileSync as jest.MockedFunction<typeof childProcess.execFileSync>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

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
