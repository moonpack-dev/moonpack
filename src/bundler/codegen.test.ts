import { describe, expect, test } from 'bun:test';
import type { MoonpackConfig } from '../config/schema.ts';
import { generateBundle } from './codegen.ts';
import type { DependencyGraph, ModuleNode } from './graph.ts';

function createMockNode(
  moduleName: string,
  source: string,
  dependencies: string[] = [],
  requireMappings: Map<string, string> = new Map()
): ModuleNode {
  return {
    moduleName,
    filePath: `/test/${moduleName.replace(/\./g, '/')}.lua`,
    source,
    requires: [],
    dependencies,
    requireMappings,
  };
}

function createMockGraph(
  entryModuleName: string,
  modules: Map<string, ModuleNode>,
  moduleOrder: string[]
): DependencyGraph {
  const entryPoint = modules.get(entryModuleName)!;
  return { entryPoint, modules, moduleOrder };
}

function createMockConfig(overrides: Partial<MoonpackConfig> = {}): MoonpackConfig {
  return {
    name: 'test-project',
    entry: 'src/main.lua',
    outDir: 'dist',
    ...overrides,
  };
}

describe('generateBundle', () => {
  describe('header generation', () => {
    test('generates header without version', () => {
      const modules = new Map<string, ModuleNode>();
      modules.set('main', createMockNode('main', "print('hello')"));

      const graph = createMockGraph('main', modules, ['main']);
      const config = createMockConfig({ name: 'my-script' });

      const result = generateBundle({ graph, config });

      expect(result).toContain('-- my-script');
      expect(result).toContain('-- Built with moonpack');
      expect(result).not.toContain(' v');
    });

    test('generates header with version', () => {
      const modules = new Map<string, ModuleNode>();
      modules.set('main', createMockNode('main', "print('hello')"));

      const graph = createMockGraph('main', modules, ['main']);
      const config = createMockConfig({ name: 'my-script', version: '1.2.3' });

      const result = generateBundle({ graph, config });

      expect(result).toContain('-- my-script v1.2.3');
    });
  });

  describe('module loader', () => {
    test('includes __modules and __loaded tables', () => {
      const modules = new Map<string, ModuleNode>();
      modules.set('main', createMockNode('main', "print('hello')"));

      const graph = createMockGraph('main', modules, ['main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).toContain('local __modules = {}');
      expect(result).toContain('local __loaded = {}');
    });

    test('includes __load function', () => {
      const modules = new Map<string, ModuleNode>();
      modules.set('main', createMockNode('main', "print('hello')"));

      const graph = createMockGraph('main', modules, ['main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).toContain('local function __load(name)');
      expect(result).toContain('if __loaded[name] then return __loaded[name] end');
      expect(result).toContain('if __modules[name] then');
      expect(result).toContain('return require(name)');
    });
  });

  describe('module wrapping', () => {
    test('wraps non-entry modules in __modules', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([['./utils', 'utils']]);
      modules.set(
        'main',
        createMockNode(
          'main',
          "local utils = require('./utils')\nprint('main')",
          ['utils'],
          mainMappings
        )
      );
      modules.set('utils', createMockNode('utils', "local M = {}\nM.version = '1.0'\nreturn M"));

      const graph = createMockGraph('main', modules, ['utils', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).toContain('__modules["utils"] = function()');
      expect(result).toContain('    local M = {}');
      expect(result).toContain('    return M');
      expect(result).toContain('end');
    });

    test('does NOT wrap entry module', () => {
      const modules = new Map<string, ModuleNode>();
      modules.set('main', createMockNode('main', "print('main entry')"));

      const graph = createMockGraph('main', modules, ['main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).not.toContain('__modules["main"]');
      expect(result).toContain("print('main entry')");
    });

    test('entry point content appears at top level (not wrapped)', () => {
      const modules = new Map<string, ModuleNode>();
      modules.set('entry', createMockNode('entry', 'local x = 1\nprint(x)'));

      const graph = createMockGraph('entry', modules, ['entry']);
      const result = generateBundle({ graph, config: createMockConfig() });

      const lines = result.split('\n');
      const entryLine = lines.find((l) => l.includes('local x = 1'));
      expect(entryLine).toBeDefined();
      expect(entryLine!.startsWith('    ')).toBe(false);
    });
  });

  describe('require transformation', () => {
    test('transforms bundled requires to __load in modules', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([['./utils', 'utils']]);
      modules.set(
        'main',
        createMockNode('main', "local utils = require('./utils')", ['utils'], mainMappings)
      );
      const utilsMappings = new Map([['./helper', 'helper']]);
      modules.set(
        'utils',
        createMockNode(
          'utils',
          "local helper = require('./helper')\nreturn {}",
          ['helper'],
          utilsMappings
        )
      );
      modules.set('helper', createMockNode('helper', 'return {}'));

      const graph = createMockGraph('main', modules, ['helper', 'utils', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).toContain("__load('helper')");
      expect(result).toContain("__load('utils')");
    });

    test('transforms bundled requires in entry point', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([['./utils', 'utils']]);
      modules.set(
        'main',
        createMockNode(
          'main',
          "local utils = require('./utils')\nprint('done')",
          ['utils'],
          mainMappings
        )
      );
      modules.set('utils', createMockNode('utils', 'return {}'));

      const graph = createMockGraph('main', modules, ['utils', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      const entrySection = result.split('end\n\n').pop()!;
      expect(entrySection).toContain("__load('utils')");
    });

    test('preserves external requires', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([['./utils', 'utils']]);
      modules.set(
        'main',
        createMockNode(
          'main',
          "local samp = require('samp.events')\nlocal utils = require('./utils')",
          ['utils'],
          mainMappings
        )
      );
      modules.set('utils', createMockNode('utils', 'return {}'));

      const graph = createMockGraph('main', modules, ['utils', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).toContain("require('samp.events')");
      expect(result).toContain("__load('utils')");
    });
  });

  describe('indentation', () => {
    test('indents wrapped module content with 4 spaces', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([['./utils', 'utils']]);
      modules.set(
        'main',
        createMockNode('main', "local utils = require('./utils')", ['utils'], mainMappings)
      );
      modules.set(
        'utils',
        createMockNode('utils', 'local x = 1\nlocal y = 2\nreturn { x = x, y = y }')
      );

      const graph = createMockGraph('main', modules, ['utils', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).toContain('    local x = 1');
      expect(result).toContain('    local y = 2');
      expect(result).toContain('    return { x = x, y = y }');
    });

    test('preserves empty lines in indented content', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([['./utils', 'utils']]);
      modules.set(
        'main',
        createMockNode('main', "local utils = require('./utils')", ['utils'], mainMappings)
      );
      modules.set('utils', createMockNode('utils', 'local x = 1\n\nlocal y = 2\nreturn {}'));

      const graph = createMockGraph('main', modules, ['utils', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      const utilsSection = result.match(
        /__modules\["utils"\] = function\(\)\n([\s\S]*?)\nend/
      )?.[1];
      expect(utilsSection).toBeDefined();
      expect(utilsSection).toContain('    local x = 1');
      expect(utilsSection).toContain('\n\n');
      expect(utilsSection).toContain('    local y = 2');
    });
  });

  describe('module order', () => {
    test('outputs modules in topological order (dependencies first)', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([
        ['./a', 'a'],
        ['./b', 'b'],
      ]);
      modules.set(
        'main',
        createMockNode('main', "require('./a')\nrequire('./b')", ['a', 'b'], mainMappings)
      );
      const aMappings = new Map([['./c', 'c']]);
      modules.set('a', createMockNode('a', "require('./c')\nreturn {}", ['c'], aMappings));
      const bMappings = new Map([['./c', 'c']]);
      modules.set('b', createMockNode('b', "require('./c')\nreturn {}", ['c'], bMappings));
      modules.set('c', createMockNode('c', 'return {}'));

      const graph = createMockGraph('main', modules, ['c', 'a', 'b', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      const cIndex = result.indexOf('__modules["c"]');
      const aIndex = result.indexOf('__modules["a"]');
      const bIndex = result.indexOf('__modules["b"]');

      expect(cIndex).toBeLessThan(aIndex);
      expect(cIndex).toBeLessThan(bIndex);
    });

    test('entry point comes last in output', () => {
      const modules = new Map<string, ModuleNode>();
      const mainMappings = new Map([['./utils', 'utils']]);
      modules.set(
        'main',
        createMockNode(
          'main',
          "local utils = require('./utils')\nprint('entry')",
          ['utils'],
          mainMappings
        )
      );
      modules.set('utils', createMockNode('utils', 'return {}'));

      const graph = createMockGraph('main', modules, ['utils', 'main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      const lastModuleEnd = result.lastIndexOf('end\n');
      const entryPrint = result.indexOf("print('entry')");
      expect(entryPrint).toBeGreaterThan(lastModuleEnd);
    });
  });

  describe('single module bundle', () => {
    test('generates valid bundle for entry-only project', () => {
      const modules = new Map<string, ModuleNode>();
      modules.set('main', createMockNode('main', "print('hello world')"));

      const graph = createMockGraph('main', modules, ['main']);
      const result = generateBundle({ graph, config: createMockConfig() });

      expect(result).toContain('-- test-project');
      expect(result).toContain('local __modules = {}');
      expect(result).toContain('local function __load(name)');
      expect(result).toContain("print('hello world')");
      expect(result).not.toContain('__modules["main"]');
    });
  });
});
