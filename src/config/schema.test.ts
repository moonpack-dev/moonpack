import { describe, expect, test } from 'bun:test';
import { MoonpackError } from '../utils/errors.ts';
import { validateConfig } from './schema.ts';

describe('validateConfig', () => {
  const configPath = '/test/moonpack.json';

  describe('valid configs', () => {
    test('accepts minimal valid config', () => {
      const raw = { name: 'myproject', entry: 'src/main.lua' };
      const result = validateConfig(raw, configPath);
      expect(result.name).toBe('myproject');
      expect(result.entry).toBe('src/main.lua');
      expect(result.outDir).toBe('dist');
      expect(result.version).toBeUndefined();
    });

    test('accepts full config with all fields', () => {
      const raw = {
        name: 'myproject',
        version: '1.0.0',
        entry: 'src/main.lua',
        outDir: 'build',
      };
      const result = validateConfig(raw, configPath);
      expect(result.name).toBe('myproject');
      expect(result.version).toBe('1.0.0');
      expect(result.entry).toBe('src/main.lua');
      expect(result.outDir).toBe('build');
    });

    test('applies default outDir when not provided', () => {
      const raw = { name: 'myproject', entry: 'main.lua' };
      const result = validateConfig(raw, configPath);
      expect(result.outDir).toBe('dist');
    });
  });

  describe('missing required fields', () => {
    test('throws error when name is missing', () => {
      const raw = { entry: 'main.lua' };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect(e).toBeInstanceOf(MoonpackError);
        expect((e as MoonpackError).code).toBe('INVALID_CONFIG');
        expect((e as MoonpackError).message).toContain("'name' is required");
      }
    });

    test('throws error when entry is missing', () => {
      const raw = { name: 'myproject' };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect(e).toBeInstanceOf(MoonpackError);
        expect((e as MoonpackError).message).toContain("'entry' is required");
      }
    });

    test('throws error with multiple missing fields', () => {
      const raw = {};
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect(e).toBeInstanceOf(MoonpackError);
        expect((e as MoonpackError).message).toContain("'name' is required");
        expect((e as MoonpackError).message).toContain("'entry' is required");
      }
    });
  });

  describe('invalid types', () => {
    test('throws error when name is not a string', () => {
      const raw = { name: 123, entry: 'main.lua' };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
    });

    test('throws error when name is empty string', () => {
      const raw = { name: '', entry: 'main.lua' };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
    });

    test('throws error when entry is not a string', () => {
      const raw = { name: 'myproject', entry: 123 };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
    });

    test('throws error when entry is empty string', () => {
      const raw = { name: 'myproject', entry: '' };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
    });

    test('throws error when version is not a string', () => {
      const raw = { name: 'myproject', entry: 'main.lua', version: 123 };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("'version' must be a string");
      }
    });

    test('throws error when outDir is not a string', () => {
      const raw = { name: 'myproject', entry: 'main.lua', outDir: 123 };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("'outDir' must be a string");
      }
    });
  });

  describe('unknown fields', () => {
    test('ignores unknown fields', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        unknownField: 'value',
        anotherUnknown: 123,
      };
      const result = validateConfig(raw, configPath);
      expect(result.name).toBe('myproject');
      expect(result.entry).toBe('main.lua');
      expect((result as Record<string, unknown>).unknownField).toBeUndefined();
    });
  });

  describe('error details', () => {
    test('includes config path in error message', () => {
      const raw = {};
      try {
        validateConfig(raw, '/custom/path/moonpack.json');
      } catch (e) {
        expect((e as MoonpackError).message).toContain('/custom/path/moonpack.json');
      }
    });

    test('includes errors array in error details', () => {
      const raw = {};
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).details.errors).toBeArray();
        expect((e as MoonpackError).details.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
