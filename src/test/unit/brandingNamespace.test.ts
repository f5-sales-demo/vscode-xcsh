// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Branding namespace — all user-facing identifiers use xcsh.* prefix', () => {
  let pkg: Record<string, unknown>;

  beforeAll(() => {
    const raw = fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf-8');
    pkg = JSON.parse(raw);
  });

  it('extension name is xcsh', () => {
    expect(pkg.name).toBe('xcsh');
  });

  it('display name is xcsh', () => {
    expect(pkg.displayName).toBe('xcsh');
  });

  describe('commands', () => {
    it('all command IDs start with xcsh.', () => {
      const contributes = pkg.contributes as Record<string, unknown>;
      const commands = contributes.commands as Array<{ command: string }>;
      const bad = commands.filter((c) => !c.command.startsWith('xcsh.'));
      expect(bad.map((c) => c.command)).toEqual([]);
    });
  });

  describe('settings', () => {
    it('all configuration property keys start with xcsh.', () => {
      const contributes = pkg.contributes as Record<string, unknown>;
      const configuration = contributes.configuration as { properties: Record<string, unknown> };
      const keys = Object.keys(configuration.properties);
      const bad = keys.filter((k) => !k.startsWith('xcsh.'));
      expect(bad).toEqual([]);
    });
  });

  describe('views and containers', () => {
    it('activity bar container IDs use xcsh prefix', () => {
      const contributes = pkg.contributes as Record<string, unknown>;
      const containers = contributes.viewsContainers as { activitybar: Array<{ id: string }> };
      const ids = containers.activitybar.map((c) => c.id);
      const bad = ids.filter((id) => id.includes('f5xc'));
      expect(bad).toEqual([]);
    });

    it('view container keys use xcsh prefix', () => {
      const contributes = pkg.contributes as Record<string, unknown>;
      const views = contributes.views as Record<string, unknown>;
      const keys = Object.keys(views);
      const bad = keys.filter((k) => k.includes('f5xc'));
      expect(bad).toEqual([]);
    });

    it('individual view IDs start with xcsh.', () => {
      const contributes = pkg.contributes as Record<string, unknown>;
      const views = contributes.views as Record<string, Array<{ id: string }>>;
      const allIds = Object.values(views)
        .flat()
        .map((v) => v.id);
      const bad = allIds.filter((id) => id.includes('f5xc'));
      expect(bad).toEqual([]);
    });
  });

  describe('menus', () => {
    it('no menu when-clauses reference f5xc', () => {
      const contributes = pkg.contributes as Record<string, unknown>;
      const menus = contributes.menus as Record<string, Array<{ when?: string; command?: string }>>;
      const allWhens: string[] = [];
      const allCommands: string[] = [];
      for (const items of Object.values(menus)) {
        for (const item of items) {
          if (item.when) allWhens.push(item.when);
          if (item.command) allCommands.push(item.command);
        }
      }
      const badWhens = allWhens.filter((w) => w.includes('f5xc'));
      const badCmds = allCommands.filter((c) => c.startsWith('f5' + 'xc.'));
      expect(badWhens).toEqual([]);
      expect(badCmds).toEqual([]);
    });
  });

  describe('no f5xc in source file names', () => {
    it('no TypeScript source files contain f5xc in filename', () => {
      const srcDir = path.resolve(__dirname, '../../');
      const walk = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory() && e.name !== 'test' && e.name !== 'node_modules') {
            files.push(...walk(full));
          } else if (e.isFile() && e.name.endsWith('.ts') && e.name.includes('f5xc')) {
            files.push(path.relative(srcDir, full));
          }
        }
        return files;
      };
      const bad = walk(srcDir);
      expect(bad).toEqual([]);
    });
  });
});
