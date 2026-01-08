import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createFileStructure, createTempDir, type TempDir } from '../test-utils.ts';
import { MoonpackError } from '../utils/errors.ts';
import { type BuildGraphOptions, buildDependencyGraph } from './graph.ts';

describe('buildDependencyGraph', () => {
  let tempDir: TempDir;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await tempDir.cleanup();
  });

  async function buildGraph(files: Record<string, string>, entryFile: string) {
    await createFileStructure(tempDir.path, files);
    const options: BuildGraphOptions = {
      entryPath: `${tempDir.path}/${entryFile}`,
      sourceRoot: tempDir.path,
    };
    return buildDependencyGraph(options);
  }

  describe('single module', () => {
    test('builds graph for module with no dependencies', async () => {
      const graph = await buildGraph({ 'main.lua': "print('hello')\nreturn {}" }, 'main.lua');

      expect(graph.modules.size).toBe(1);
      expect(graph.entryPoint.moduleName).toBe('main');
      expect(graph.entryPoint.dependencies).toEqual([]);
      expect(graph.moduleOrder).toEqual(['main']);
    });
  });

  describe('linear dependencies', () => {
    test('builds graph for A → B', async () => {
      const graph = await buildGraph(
        {
          'a.lua': "local b = require('./b')\nreturn {}",
          'b.lua': 'return {}',
        },
        'a.lua'
      );

      expect(graph.modules.size).toBe(2);
      expect(graph.modules.get('a')?.dependencies).toEqual(['b']);
      expect(graph.modules.get('b')?.dependencies).toEqual([]);
      expect(graph.moduleOrder).toEqual(['b', 'a']);
    });

    test('builds graph for A → B → C', async () => {
      const graph = await buildGraph(
        {
          'a.lua': "local b = require('./b')\nreturn {}",
          'b.lua': "local c = require('./c')\nreturn {}",
          'c.lua': 'return {}',
        },
        'a.lua'
      );

      expect(graph.modules.size).toBe(3);
      expect(graph.moduleOrder.indexOf('c')).toBeLessThan(graph.moduleOrder.indexOf('b'));
      expect(graph.moduleOrder.indexOf('b')).toBeLessThan(graph.moduleOrder.indexOf('a'));
    });
  });

  describe('diamond dependencies', () => {
    test('handles A → B, A → C, B → D, C → D', async () => {
      const graph = await buildGraph(
        {
          'a.lua': "local b = require('./b')\nlocal c = require('./c')\nreturn {}",
          'b.lua': "local d = require('./d')\nreturn {}",
          'c.lua': "local d = require('./d')\nreturn {}",
          'd.lua': 'return {}',
        },
        'a.lua'
      );

      expect(graph.modules.size).toBe(4);
      expect(graph.modules.has('a')).toBe(true);
      expect(graph.modules.has('b')).toBe(true);
      expect(graph.modules.has('c')).toBe(true);
      expect(graph.modules.has('d')).toBe(true);

      const dIndex = graph.moduleOrder.indexOf('d');
      const bIndex = graph.moduleOrder.indexOf('b');
      const cIndex = graph.moduleOrder.indexOf('c');
      const aIndex = graph.moduleOrder.indexOf('a');

      expect(dIndex).toBeLessThan(bIndex);
      expect(dIndex).toBeLessThan(cIndex);
      expect(bIndex).toBeLessThan(aIndex);
      expect(cIndex).toBeLessThan(aIndex);
    });
  });

  describe('external modules (non-path requires)', () => {
    test('excludes external modules from graph', async () => {
      const graph = await buildGraph(
        {
          'main.lua':
            "local samp = require('samp.events')\nlocal utils = require('./utils')\nreturn {}",
          'utils.lua': 'return {}',
        },
        'main.lua'
      );

      expect(graph.modules.size).toBe(2);
      expect(graph.modules.has('samp.events')).toBe(false);
      expect(graph.modules.has('utils')).toBe(true);
      expect(graph.entryPoint.dependencies).toEqual(['utils']);
    });

    test('excludes all external modules (without path prefix)', async () => {
      const graph = await buildGraph(
        {
          'main.lua': `
local a = require('samp')
local b = require('samp.events')
local c = require('imgui')
local d = require('./local')
return {}`,
          'local.lua': 'return {}',
        },
        'main.lua'
      );

      expect(graph.modules.size).toBe(2);
      expect(graph.modules.has('main')).toBe(true);
      expect(graph.modules.has('local')).toBe(true);
    });
  });

  describe('circular dependency detection', () => {
    test('detects simple cycle A → B → A', async () => {
      await expect(
        buildGraph(
          {
            'a.lua': "local b = require('./b')\nreturn {}",
            'b.lua': "local a = require('./a')\nreturn {}",
          },
          'a.lua'
        )
      ).rejects.toThrow(MoonpackError);

      try {
        await buildGraph(
          {
            'a.lua': "local b = require('./b')\nreturn {}",
            'b.lua': "local a = require('./a')\nreturn {}",
          },
          'a.lua'
        );
      } catch (e) {
        expect(e).toBeInstanceOf(MoonpackError);
        expect((e as MoonpackError).code).toBe('CIRCULAR_DEPENDENCY');
        expect((e as MoonpackError).message).toContain('a → b → a');
      }
    });

    test('detects self-reference A → A', async () => {
      await expect(
        buildGraph({ 'a.lua': "local a = require('./a')\nreturn {}" }, 'a.lua')
      ).rejects.toThrow(MoonpackError);

      try {
        await buildGraph({ 'a.lua': "local a = require('./a')\nreturn {}" }, 'a.lua');
      } catch (e) {
        expect((e as MoonpackError).message).toContain('a → a');
      }
    });

    test('detects long cycle A → B → C → D → E → A', async () => {
      await expect(
        buildGraph(
          {
            'a.lua': "local b = require('./b')\nreturn {}",
            'b.lua': "local c = require('./c')\nreturn {}",
            'c.lua': "local d = require('./d')\nreturn {}",
            'd.lua': "local e = require('./e')\nreturn {}",
            'e.lua': "local a = require('./a')\nreturn {}",
          },
          'a.lua'
        )
      ).rejects.toThrow(MoonpackError);

      try {
        await buildGraph(
          {
            'a.lua': "local b = require('./b')\nreturn {}",
            'b.lua': "local c = require('./c')\nreturn {}",
            'c.lua': "local d = require('./d')\nreturn {}",
            'd.lua': "local e = require('./e')\nreturn {}",
            'e.lua': "local a = require('./a')\nreturn {}",
          },
          'a.lua'
        );
      } catch (e) {
        expect((e as MoonpackError).message).toContain('a → b → c → d → e → a');
      }
    });

    test('detects mid-chain cycle (not involving entry)', async () => {
      await expect(
        buildGraph(
          {
            'entry.lua': "local a = require('./a')\nreturn {}",
            'a.lua': "local b = require('./b')\nreturn {}",
            'b.lua': "local c = require('./c')\nreturn {}",
            'c.lua': "local b = require('./b')\nreturn {}",
          },
          'entry.lua'
        )
      ).rejects.toThrow(MoonpackError);

      try {
        await buildGraph(
          {
            'entry.lua': "local a = require('./a')\nreturn {}",
            'a.lua': "local b = require('./b')\nreturn {}",
            'b.lua': "local c = require('./c')\nreturn {}",
            'c.lua': "local b = require('./b')\nreturn {}",
          },
          'entry.lua'
        );
      } catch (e) {
        expect((e as MoonpackError).message).toContain('b → c → b');
      }
    });

    test('detects multiple independent cycles', async () => {
      try {
        await buildGraph(
          {
            'entry.lua': "local a = require('./a')\nlocal x = require('./x')\nreturn {}",
            'a.lua': "local b = require('./b')\nreturn {}",
            'b.lua': "local a = require('./a')\nreturn {}",
            'x.lua': "local y = require('./y')\nreturn {}",
            'y.lua': "local x = require('./x')\nreturn {}",
          },
          'entry.lua'
        );
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(MoonpackError);
        expect((e as MoonpackError).code).toBe('CIRCULAR_DEPENDENCY');
        expect((e as MoonpackError).details.cycles.length).toBe(2);
      }
    });
  });

  describe('module not found', () => {
    test('throws error for missing module', async () => {
      await expect(
        buildGraph({ 'main.lua': "local missing = require('./missing')\nreturn {}" }, 'main.lua')
      ).rejects.toThrow(MoonpackError);

      try {
        await buildGraph(
          { 'main.lua': "local missing = require('./missing')\nreturn {}" },
          'main.lua'
        );
      } catch (e) {
        expect(e).toBeInstanceOf(MoonpackError);
        expect((e as MoonpackError).code).toBe('MODULE_NOT_FOUND');
        expect((e as MoonpackError).message).toContain('./missing');
      }
    });
  });

  describe('module order (topological sort)', () => {
    test('dependencies come before dependents', async () => {
      const graph = await buildGraph(
        {
          'main.lua': "local a = require('./a')\nlocal b = require('./b')\nreturn {}",
          'a.lua': "local c = require('./c')\nreturn {}",
          'b.lua': "local c = require('./c')\nreturn {}",
          'c.lua': 'return {}',
        },
        'main.lua'
      );

      for (const moduleName of graph.moduleOrder) {
        const node = graph.modules.get(moduleName);
        if (node) {
          const moduleIndex = graph.moduleOrder.indexOf(moduleName);
          for (const dep of node.dependencies) {
            const depIndex = graph.moduleOrder.indexOf(dep);
            expect(depIndex).toBeLessThan(moduleIndex);
          }
        }
      }
    });
  });

  describe('require mappings', () => {
    test('populates requireMappings for local requires', async () => {
      const graph = await buildGraph(
        {
          'main.lua': "local utils = require('./utils')\nreturn {}",
          'utils.lua': 'return {}',
        },
        'main.lua'
      );

      expect(graph.entryPoint.requireMappings.get('./utils')).toBe('utils');
    });

    test('does not include external requires in mappings', async () => {
      const graph = await buildGraph(
        {
          'main.lua':
            "local samp = require('samp.events')\nlocal utils = require('./utils')\nreturn {}",
          'utils.lua': 'return {}',
        },
        'main.lua'
      );

      expect(graph.entryPoint.requireMappings.has('samp.events')).toBe(false);
      expect(graph.entryPoint.requireMappings.get('./utils')).toBe('utils');
    });
  });
});
