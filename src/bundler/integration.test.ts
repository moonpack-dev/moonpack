import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { MoonpackError } from '../utils/errors.ts';
import { generateBundle } from './codegen.ts';
import { buildDependencyGraph } from './graph.ts';
import { lintGraph } from './lint.ts';

const FIXTURES_DIR = join(import.meta.dir, '../../test/fixtures');

interface FixtureConfig {
  name: string;
  entry: string;
  version?: string;
}

async function loadFixtureConfig(fixtureName: string): Promise<FixtureConfig> {
  const configPath = join(FIXTURES_DIR, fixtureName, 'moonpack.json');
  const content = await Bun.file(configPath).text();
  return JSON.parse(content);
}

async function buildFixture(fixtureName: string) {
  const config = await loadFixtureConfig(fixtureName);
  const fixtureDir = join(FIXTURES_DIR, fixtureName);
  const sourceRoot = join(fixtureDir, 'src');
  const entryPath = join(fixtureDir, config.entry);

  const graph = await buildDependencyGraph({
    entryPath,
    sourceRoot,
  });

  const bundle = generateBundle({
    graph,
    config: {
      name: config.name,
      version: config.version,
      entry: config.entry,
      outDir: 'dist',
    },
  });

  const lintResult = lintGraph(graph);

  return { graph, bundle, config, lintResult };
}

describe('fixture integration tests', () => {
  describe('successful builds', () => {
    test('basic - multi-module bundling', async () => {
      const { graph, bundle } = await buildFixture('basic');

      expect(graph.modules.size).toBeGreaterThan(1);
      expect(bundle).toContain('__modules');
      expect(bundle).toContain('__load');
      expect(bundle).toContain('-- TestMod');
    });

    test('strings - requires inside strings ignored', async () => {
      const { bundle } = await buildFixture('strings');

      expect(bundle).toContain('__load');
      expect(bundle).toContain('require("module")');
    });

    test('require-syntax - MoonLoader patterns', async () => {
      const { graph, bundle } = await buildFixture('require-syntax');

      expect(graph.modules.size).toBeGreaterThan(0);
      expect(bundle).toContain('__modules');
    });

    test('pcall - pcall require transformation', async () => {
      const { bundle } = await buildFixture('pcall');

      expect(bundle).toContain('pcall(__load');
    });

    test('multiline-string - requires in multiline strings ignored', async () => {
      const { bundle } = await buildFixture('multiline-string');

      expect(bundle).toContain('__modules');
    });
  });

  describe('circular dependency detection', () => {
    test('circular - simple A → B → A', async () => {
      await expect(buildFixture('circular')).rejects.toThrow(MoonpackError);

      try {
        await buildFixture('circular');
      } catch (e) {
        expect((e as MoonpackError).code).toBe('CIRCULAR_DEPENDENCY');
        expect((e as MoonpackError).message).toMatch(/a → b → a/i);
      }
    });

    test('circular-self - self-reference A → A', async () => {
      await expect(buildFixture('circular-self')).rejects.toThrow(MoonpackError);

      try {
        await buildFixture('circular-self');
      } catch (e) {
        expect((e as MoonpackError).code).toBe('CIRCULAR_DEPENDENCY');
      }
    });

    test('circular-long - long chain A → B → C → D → E → A', async () => {
      await expect(buildFixture('circular-long')).rejects.toThrow(MoonpackError);

      try {
        await buildFixture('circular-long');
      } catch (e) {
        expect((e as MoonpackError).code).toBe('CIRCULAR_DEPENDENCY');
        expect((e as MoonpackError).message).toContain('a → b → c → d → e → a');
      }
    });

    test('circular-mid-chain - cycle not involving entry', async () => {
      await expect(buildFixture('circular-mid-chain')).rejects.toThrow(MoonpackError);

      try {
        await buildFixture('circular-mid-chain');
      } catch (e) {
        expect((e as MoonpackError).code).toBe('CIRCULAR_DEPENDENCY');
        expect((e as MoonpackError).message).toContain('b → c → d → b');
      }
    });

    test('circular-diamond - diamond pattern with cycle', async () => {
      await expect(buildFixture('circular-diamond')).rejects.toThrow(MoonpackError);

      try {
        await buildFixture('circular-diamond');
      } catch (e) {
        expect((e as MoonpackError).code).toBe('CIRCULAR_DEPENDENCY');
      }
    });

    test('circular-multiple - multiple independent cycles detected', async () => {
      await expect(buildFixture('circular-multiple')).rejects.toThrow(MoonpackError);

      try {
        await buildFixture('circular-multiple');
      } catch (e) {
        const error = e as MoonpackError;
        expect(error.code).toBe('CIRCULAR_DEPENDENCY');
        expect((error.details?.cycles as unknown[]).length).toBe(2);
      }
    });
  });

  describe('error handling', () => {
    test('missing - module not found error', async () => {
      await expect(buildFixture('missing')).rejects.toThrow(MoonpackError);

      try {
        await buildFixture('missing');
      } catch (e) {
        expect((e as MoonpackError).code).toBe('MODULE_NOT_FOUND');
        expect((e as MoonpackError).message).toContain('./does/not/exist');
      }
    });
  });

  describe('lint warnings', () => {
    test('duplicate-external - detects duplicate sampev handler across files', async () => {
      const { lintResult, bundle } = await buildFixture('duplicate-external');

      expect(bundle).toContain('__modules');
      expect(lintResult.duplicateAssignments).toHaveLength(1);
      expect(lintResult.duplicateAssignments[0].propertyPath).toBe('sampev.onServerMessage');
      expect(lintResult.duplicateAssignments[0].assignments).toHaveLength(2);

      const files = lintResult.duplicateAssignments[0].assignments.map((a) => a.filePath);
      expect(files.some((f) => f.includes('main.lua'))).toBe(true);
      expect(files.some((f) => f.includes('chat.lua'))).toBe(true);
    });

    test('basic - no warnings for clean codebase', async () => {
      const { lintResult } = await buildFixture('basic');

      expect(lintResult.duplicateAssignments).toHaveLength(0);
    });
  });

  describe('auto-localization', () => {
    test('auto-localize - localizes functions in modules but not entry', async () => {
      const { bundle } = await buildFixture('auto-localize');

      expect(bundle).toContain('__modules["helpers"]');
      expect(bundle).toContain('local function log(msg)');
      expect(bundle).toContain('local function greet(name)');

      expect(bundle).toContain('function main()');
      expect(bundle).toContain('function onScriptTerminate(');
      expect(bundle).toContain('function sampev.onServerMessage(');

      expect(bundle).not.toMatch(/local function main\(/);
      expect(bundle).not.toMatch(/local function onScriptTerminate\(/);
      expect(bundle).not.toMatch(/local function sampev\.onServerMessage\(/);
    });
  });
});
