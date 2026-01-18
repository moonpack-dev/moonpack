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

  describe('dependencies validation', () => {
    test('accepts valid dependencies with baseUrl and files', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: {
          baseUrl: 'https://example.com/',
          files: ['lib/requests.lua', 'lib/samp/events.lua'],
        },
      };
      const result = validateConfig(raw, configPath);
      expect(result.dependencies).toEqual(raw.dependencies);
    });

    test('accepts dependencies with file remapping', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: {
          baseUrl: 'https://example.com/',
          files: ['lib/a.lua', { path: 'lib/renamed.lua', src: 'old/name.lua' }],
        },
      };
      const result = validateConfig(raw, configPath);
      expect(result.dependencies).toEqual(raw.dependencies);
    });

    test('accepts dependencies with direct URL mapping', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: {
          baseUrl: 'https://example.com/',
          files: ['lib/a.lua'],
          'lib/external.dll': 'https://other.com/file.dll',
        },
      };
      const result = validateConfig(raw, configPath);
      expect(result.dependencies).toEqual(raw.dependencies);
    });

    test('accepts dependencies as array of sources', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: [
          { baseUrl: 'https://source1.com/', files: ['lib/a.lua'] },
          { baseUrl: 'https://source2.com/', files: ['lib/b.lua'] },
        ],
      };
      const result = validateConfig(raw, configPath);
      expect(result.dependencies).toEqual(raw.dependencies);
    });

    test('accepts file entry with full url override', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: {
          baseUrl: 'https://example.com/',
          files: [{ path: 'lib/special.dll', url: 'https://other.com/special.dll' }],
        },
      };
      const result = validateConfig(raw, configPath);
      expect(result.dependencies).toEqual(raw.dependencies);
    });

    test('throws error when dependencies is not an object', () => {
      const raw = { name: 'myproject', entry: 'main.lua', dependencies: 'invalid' };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain('dependencies: must be an object');
      }
    });

    test('throws error when baseUrl is missing', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: { files: ['lib/a.lua'] },
      };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("'baseUrl' is required");
      }
    });

    test('throws error when files is missing', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: { baseUrl: 'https://example.com/' },
      };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("'files' is required");
      }
    });

    test('throws error when file entry has neither src nor url', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: {
          baseUrl: 'https://example.com/',
          files: [{ path: 'lib/test.lua' }],
        },
      };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("must have either 'src' or 'url'");
      }
    });

    test('throws error when file entry has both src and url', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: {
          baseUrl: 'https://example.com/',
          files: [{ path: 'lib/test.lua', src: 'a.lua', url: 'https://x.com/b.lua' }],
        },
      };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("cannot have both 'src' and 'url'");
      }
    });

    test('throws error when direct mapping value is not a string', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        dependencies: {
          baseUrl: 'https://example.com/',
          files: ['lib/a.lua'],
          'lib/test.lua': 123,
        },
      };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain('direct mapping must be a string URL');
      }
    });
  });

  describe('ui validation', () => {
    test('accepts valid ui config with color', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        ui: { color: 'FFAA00' },
      };
      const result = validateConfig(raw, configPath);
      expect(result.ui).toEqual({ color: 'FFAA00' });
    });

    test('accepts ui config with lowercase hex color', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        ui: { color: 'ffaa00' },
      };
      const result = validateConfig(raw, configPath);
      expect(result.ui).toEqual({ color: 'ffaa00' });
    });

    test('accepts empty ui object', () => {
      const raw = {
        name: 'myproject',
        entry: 'main.lua',
        ui: {},
      };
      const result = validateConfig(raw, configPath);
      expect(result.ui).toEqual({});
    });

    test('throws error when ui is not an object', () => {
      const raw = { name: 'myproject', entry: 'main.lua', ui: 'invalid' };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("'ui' must be an object");
      }
    });

    test('throws error when ui.color is not a string', () => {
      const raw = { name: 'myproject', entry: 'main.lua', ui: { color: 123 } };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain("'ui.color' must be a string");
      }
    });

    test('throws error when ui.color is invalid hex', () => {
      const raw = { name: 'myproject', entry: 'main.lua', ui: { color: 'invalid' } };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
      try {
        validateConfig(raw, configPath);
      } catch (e) {
        expect((e as MoonpackError).message).toContain(
          "'ui.color' must be a 6-character hex color"
        );
      }
    });

    test('throws error when ui.color is too short', () => {
      const raw = { name: 'myproject', entry: 'main.lua', ui: { color: 'FFF' } };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
    });

    test('throws error when ui.color has hash prefix', () => {
      const raw = { name: 'myproject', entry: 'main.lua', ui: { color: '#FFAA00' } };
      expect(() => validateConfig(raw, configPath)).toThrow(MoonpackError);
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
