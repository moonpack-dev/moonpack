import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { MoonpackError } from '../utils/errors.ts';
import { generateBundle } from './codegen.ts';
import { buildDependencyGraph } from './graph.ts';

const FIXTURES_DIR = join(import.meta.dir, '../../test/fixtures');

interface FixtureConfig {
  name: string;
  entry: string;
  external?: string[];
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
    external: new Set(config.external ?? []),
  });

  const bundle = generateBundle({
    graph,
    config: {
      name: config.name,
      version: config.version,
      entry: config.entry,
      outDir: 'dist',
      external: config.external ?? [],
    },
  });

  return { graph, bundle, config };
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
        expect((e as MoonpackError).message).toContain('does.not.exist');
      }
    });
  });
});
