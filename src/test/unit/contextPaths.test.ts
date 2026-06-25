// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as path from 'node:path';

jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  homedir: jest.fn(() => '/mock/home'),
  platform: jest.fn(() => 'darwin'),
}));

import {
  getActiveContextPath,
  getActiveProfilePath,
  getConfigDir,
  getContextPath,
  getContextsDir,
  getProfilesDir,
} from '../../config/contextPaths';

describe('Context paths', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.XDG_CONFIG_HOME;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns default config dir on macOS/Linux', () => {
    expect(getConfigDir()).toBe(path.join('/mock/home', '.config', 'xcsh'));
  });

  it('respects XDG_CONFIG_HOME', () => {
    process.env.XDG_CONFIG_HOME = '/custom/config';
    expect(getConfigDir()).toBe(path.join('/custom/config', 'xcsh'));
  });

  it('returns contexts directory', () => {
    expect(getContextsDir()).toBe(path.join('/mock/home', '.config', 'xcsh', 'contexts'));
  });

  it('returns context file path', () => {
    expect(getContextPath('production')).toBe(
      path.join('/mock/home', '.config', 'xcsh', 'contexts', 'production.json'),
    );
  });

  it('returns active context file path', () => {
    expect(getActiveContextPath()).toBe(path.join('/mock/home', '.config', 'xcsh', 'active_context'));
  });

  it('returns profiles directory', () => {
    expect(getProfilesDir()).toBe(path.join('/mock/home', '.config', 'xcsh', 'profiles'));
  });

  it('returns active profile file path', () => {
    expect(getActiveProfilePath()).toBe(path.join('/mock/home', '.config', 'xcsh', 'active_profile'));
  });
});
