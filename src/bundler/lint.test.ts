import { describe, expect, test } from 'bun:test';
import type { DependencyGraph, ModuleNode } from './graph.ts';
import { formatLintWarnings, lintGraph } from './lint.ts';

function createMockGraph(
  modules: Array<{ name: string; path: string; source: string }>
): DependencyGraph {
  const moduleMap = new Map<string, ModuleNode>();

  for (const mod of modules) {
    moduleMap.set(mod.name, {
      moduleName: mod.name,
      filePath: mod.path,
      source: mod.source,
      requires: [],
      dependencies: [],
      requireMappings: new Map(),
    });
  }

  const entry = moduleMap.values().next().value!;
  return {
    entryPoint: entry,
    modules: moduleMap,
    moduleOrder: modules.map((m) => m.name),
  };
}

describe('lintGraph', () => {
  test('detects duplicate sampev handler in different files', () => {
    const graph = createMockGraph([
      {
        name: 'main',
        path: '/src/main.lua',
        source: `
local sampev = require('lib.samp.events')

function sampev.onServerMessage(color, text)
  print(text)
end
`,
      },
      {
        name: 'features.chat',
        path: '/src/features/chat.lua',
        source: `
local sampev = require('lib.samp.events')

function sampev.onServerMessage(color, text)
  -- different handler
  return false
end
`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.duplicateAssignments).toHaveLength(1);
    expect(result.duplicateAssignments[0].propertyPath).toBe('sampev.onServerMessage');
    expect(result.duplicateAssignments[0].assignments).toHaveLength(2);
  });

  test('detects assignment syntax as well as function syntax', () => {
    const graph = createMockGraph([
      {
        name: 'file1',
        path: '/src/file1.lua',
        source: `
local sampev = require('lib.samp.events')
sampev.onPlayerJoin = function(id) end
`,
      },
      {
        name: 'file2',
        path: '/src/file2.lua',
        source: `
local sampev = require('lib.samp.events')
function sampev.onPlayerJoin(id)
  -- another handler
end
`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.duplicateAssignments).toHaveLength(1);
    expect(result.duplicateAssignments[0].propertyPath).toBe('sampev.onPlayerJoin');
  });

  test('does not warn for same handler in same file', () => {
    const graph = createMockGraph([
      {
        name: 'main',
        path: '/src/main.lua',
        source: `
local sampev = require('lib.samp.events')

function sampev.onServerMessage(color, text)
  print(text)
end

-- later reassignment in same file (user's problem, not cross-file issue)
function sampev.onServerMessage(color, text)
  print("changed")
end
`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.duplicateAssignments).toHaveLength(0);
  });

  test('does not warn for path-based local requires', () => {
    const graph = createMockGraph([
      {
        name: 'file1',
        path: '/src/file1.lua',
        source: `
local mylib = require('./mylib')
mylib.handler = function() end
`,
      },
      {
        name: 'file2',
        path: '/src/file2.lua',
        source: `
local mylib = require('./mylib')
mylib.handler = function() end
`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.duplicateAssignments).toHaveLength(0);
  });

  test('tracks different variable names for same external module', () => {
    const graph = createMockGraph([
      {
        name: 'file1',
        path: '/src/file1.lua',
        source: `
local events = require('lib.samp.events')
function events.onChat() end
`,
      },
      {
        name: 'file2',
        path: '/src/file2.lua',
        source: `
local sampev = require('lib.samp.events')
function sampev.onChat() end
`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.duplicateAssignments).toHaveLength(0);
  });
});

describe('lintMoonLoaderEventsInModules', () => {
  test('detects main() in non-entry module', () => {
    const graph = createMockGraph([
      {
        name: 'entry',
        path: '/src/entry.lua',
        source: `local helpers = require('./helpers')
function main() end`,
      },
      {
        name: 'helpers',
        path: '/src/helpers.lua',
        source: `function main()
    print("This won't work!")
end`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.moonloaderEventsInModules).toHaveLength(1);
    expect(result.moonloaderEventsInModules[0].eventName).toBe('main');
    expect(result.moonloaderEventsInModules[0].filePath).toBe('/src/helpers.lua');
  });

  test('detects onScriptTerminate in non-entry module', () => {
    const graph = createMockGraph([
      {
        name: 'entry',
        path: '/src/entry.lua',
        source: `local mod = require('./mod')`,
      },
      {
        name: 'mod',
        path: '/src/mod.lua',
        source: `function onScriptTerminate(script, quit)
    print("cleanup")
end`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.moonloaderEventsInModules).toHaveLength(1);
    expect(result.moonloaderEventsInModules[0].eventName).toBe('onScriptTerminate');
  });

  test('detects multiple MoonLoader events in module', () => {
    const graph = createMockGraph([
      {
        name: 'entry',
        path: '/src/entry.lua',
        source: `local mod = require('./mod')`,
      },
      {
        name: 'mod',
        path: '/src/mod.lua',
        source: `function main() end
function onScriptTerminate() end
function onWindowMessage() end`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.moonloaderEventsInModules).toHaveLength(3);
    const eventNames = result.moonloaderEventsInModules.map((e) => e.eventName);
    expect(eventNames).toContain('main');
    expect(eventNames).toContain('onScriptTerminate');
    expect(eventNames).toContain('onWindowMessage');
  });

  test('does not warn for events in entry point', () => {
    const graph = createMockGraph([
      {
        name: 'entry',
        path: '/src/entry.lua',
        source: `function main() end
function onScriptTerminate() end`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.moonloaderEventsInModules).toHaveLength(0);
  });

  test('does not warn for local function with event name', () => {
    const graph = createMockGraph([
      {
        name: 'entry',
        path: '/src/entry.lua',
        source: `local mod = require('./mod')`,
      },
      {
        name: 'mod',
        path: '/src/mod.lua',
        source: `local function main()
    print("This is fine - it's local")
end`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.moonloaderEventsInModules).toHaveLength(0);
  });

  test('does not warn for non-event function names', () => {
    const graph = createMockGraph([
      {
        name: 'entry',
        path: '/src/entry.lua',
        source: `local mod = require('./mod')`,
      },
      {
        name: 'mod',
        path: '/src/mod.lua',
        source: `function helper() end
function process() end`,
      },
    ]);

    const result = lintGraph(graph);

    expect(result.moonloaderEventsInModules).toHaveLength(0);
  });
});

describe('formatLintWarnings', () => {
  test('formats duplicate warnings nicely', () => {
    const result = {
      duplicateAssignments: [
        {
          propertyPath: 'sampev.onServerMessage',
          assignments: [
            {
              moduleName: 'lib.samp.events',
              filePath: '/src/main.lua',
              line: 10,
              varName: 'sampev',
              propertyPath: 'sampev.onServerMessage',
            },
            {
              moduleName: 'lib.samp.events',
              filePath: '/src/chat.lua',
              line: 5,
              varName: 'sampev',
              propertyPath: 'sampev.onServerMessage',
            },
          ],
        },
      ],
      moonloaderEventsInModules: [],
    };

    const warnings = formatLintWarnings(result);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('sampev.onServerMessage');
    expect(warnings[0]).toContain('/src/main.lua:10');
    expect(warnings[0]).toContain('/src/chat.lua:5');
  });

  test('formats MoonLoader event warnings', () => {
    const result = {
      duplicateAssignments: [],
      moonloaderEventsInModules: [
        { eventName: 'onScriptTerminate', filePath: '/src/helpers.lua', line: 15 },
      ],
    };

    const warnings = formatLintWarnings(result);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('onScriptTerminate');
    expect(warnings[0]).toContain('/src/helpers.lua:15');
    expect(warnings[0]).toContain('has no effect');
  });

  test('formats both warning types', () => {
    const result = {
      duplicateAssignments: [
        {
          propertyPath: 'sampev.onChat',
          assignments: [
            {
              moduleName: 'lib.samp.events',
              filePath: '/src/a.lua',
              line: 1,
              varName: 'sampev',
              propertyPath: 'sampev.onChat',
            },
            {
              moduleName: 'lib.samp.events',
              filePath: '/src/b.lua',
              line: 2,
              varName: 'sampev',
              propertyPath: 'sampev.onChat',
            },
          ],
        },
      ],
      moonloaderEventsInModules: [{ eventName: 'main', filePath: '/src/mod.lua', line: 5 }],
    };

    const warnings = formatLintWarnings(result);

    expect(warnings).toHaveLength(2);
  });
});
