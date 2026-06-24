// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as path from 'node:path';
import { getLocalActiveContextPath, getLocalContextPath, getLocalContextsDir } from '../../config/contextPaths';

describe('Local context path helpers', () => {
  const wsFolder = '/home/user/my-project';

  it('getLocalContextsDir returns .xcsh/contexts under workspace', () => {
    expect(getLocalContextsDir(wsFolder)).toBe(path.join(wsFolder, '.xcsh', 'contexts'));
  });

  it('getLocalActiveContextPath returns active_context under local contexts', () => {
    expect(getLocalActiveContextPath(wsFolder)).toBe(path.join(wsFolder, '.xcsh', 'contexts', 'active_context'));
  });

  it('getLocalContextPath returns named json under local contexts', () => {
    expect(getLocalContextPath('staging', wsFolder)).toBe(path.join(wsFolder, '.xcsh', 'contexts', 'staging.json'));
  });
});
