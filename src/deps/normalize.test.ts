import { describe, expect, test } from 'bun:test';
import { normalizeDependencies } from './normalize.ts';

describe('normalizeDependencies', () => {
  describe('single source format', () => {
    test('handles simple string files', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: ['lib/a.lua', 'lib/b.dll'],
      });

      expect(result).toEqual({
        'lib/a.lua': 'https://example.com/lib/a.lua',
        'lib/b.dll': 'https://example.com/lib/b.dll',
      });
    });

    test('handles file with src remapping', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: [{ path: 'lib/renamed.lua', src: 'old/name.lua' }],
      });

      expect(result).toEqual({
        'lib/renamed.lua': 'https://example.com/old/name.lua',
      });
    });

    test('handles file with full url override', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: [{ path: 'lib/special.dll', url: 'https://other.com/special.dll' }],
      });

      expect(result).toEqual({
        'lib/special.dll': 'https://other.com/special.dll',
      });
    });

    test('handles direct path→url mappings', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: ['lib/a.lua'],
        'lib/external.dll': 'https://other.com/file.dll',
      });

      expect(result).toEqual({
        'lib/a.lua': 'https://example.com/lib/a.lua',
        'lib/external.dll': 'https://other.com/file.dll',
      });
    });

    test('handles mixed file types', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: [
          'lib/simple.lua',
          { path: 'lib/renamed.lua', src: 'old/name.lua' },
          { path: 'lib/external.dll', url: 'https://cdn.com/lib.dll' },
        ],
        'lib/direct.lua': 'https://other.com/direct.lua',
      });

      expect(result).toEqual({
        'lib/simple.lua': 'https://example.com/lib/simple.lua',
        'lib/renamed.lua': 'https://example.com/old/name.lua',
        'lib/external.dll': 'https://cdn.com/lib.dll',
        'lib/direct.lua': 'https://other.com/direct.lua',
      });
    });
  });

  describe('multiple sources format', () => {
    test('handles array of sources', () => {
      const result = normalizeDependencies([
        { baseUrl: 'https://source1.com/', files: ['lib/a.lua'] },
        { baseUrl: 'https://source2.com/', files: ['lib/b.lua'] },
      ]);

      expect(result).toEqual({
        'lib/a.lua': 'https://source1.com/lib/a.lua',
        'lib/b.lua': 'https://source2.com/lib/b.lua',
      });
    });

    test('handles mixed sources with remapping', () => {
      const result = normalizeDependencies([
        {
          baseUrl: 'https://main.com/',
          files: ['lib/common.lua', { path: 'lib/renamed.dll', src: 'bin/original.dll' }],
        },
        {
          baseUrl: 'https://secondary.com/',
          files: [{ path: 'lib/special.lua', url: 'https://cdn.com/special.lua' }],
        },
      ]);

      expect(result).toEqual({
        'lib/common.lua': 'https://main.com/lib/common.lua',
        'lib/renamed.dll': 'https://main.com/bin/original.dll',
        'lib/special.lua': 'https://cdn.com/special.lua',
      });
    });
  });

  describe('URL normalization', () => {
    test('handles baseUrl without trailing slash', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com',
        files: ['lib/a.lua'],
      });

      expect(result['lib/a.lua']).toBe('https://example.com/lib/a.lua');
    });

    test('handles baseUrl with trailing slash', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: ['lib/a.lua'],
      });

      expect(result['lib/a.lua']).toBe('https://example.com/lib/a.lua');
    });

    test('handles file path with leading slash', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: ['/lib/a.lua'],
      });

      expect(result['/lib/a.lua']).toBe('https://example.com/lib/a.lua');
    });
  });

  describe('destination prefix', () => {
    test('prepends destination to simple file paths', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/lib/',
        destination: 'lib/',
        files: ['lfs.dll', 'lanes.lua'],
      });

      expect(result).toEqual({
        'lib/lfs.dll': 'https://example.com/lib/lfs.dll',
        'lib/lanes.lua': 'https://example.com/lib/lanes.lua',
      });
    });

    test('prepends destination to remapped paths', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        destination: 'lib/',
        files: [{ path: 'renamed.lua', src: 'original.lua' }],
      });

      expect(result).toEqual({
        'lib/renamed.lua': 'https://example.com/original.lua',
      });
    });

    test('prepends destination to url override paths', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        destination: 'lib/',
        files: [{ path: 'special.dll', url: 'https://cdn.com/special.dll' }],
      });

      expect(result).toEqual({
        'lib/special.dll': 'https://cdn.com/special.dll',
      });
    });

    test('handles destination without trailing slash', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        destination: 'lib',
        files: ['a.lua'],
      });

      expect(result['lib/a.lua']).toBe('https://example.com/a.lua');
    });

    test('handles multiple sources with different destinations', () => {
      const result = normalizeDependencies([
        {
          baseUrl: 'https://example.com/lib/',
          destination: 'lib/',
          files: ['lfs.dll'],
        },
        {
          baseUrl: 'https://example.com/resource/mod/',
          destination: 'resource/mod/',
          files: ['icon.png'],
        },
      ]);

      expect(result).toEqual({
        'lib/lfs.dll': 'https://example.com/lib/lfs.dll',
        'resource/mod/icon.png': 'https://example.com/resource/mod/icon.png',
      });
    });

    test('direct mappings are not affected by destination', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        destination: 'lib/',
        files: ['a.lua'],
        'custom/path.dll': 'https://other.com/file.dll',
      });

      expect(result).toEqual({
        'lib/a.lua': 'https://example.com/a.lua',
        'custom/path.dll': 'https://other.com/file.dll',
      });
    });
  });

  describe('edge cases', () => {
    test('handles empty files array', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: [],
      });

      expect(result).toEqual({});
    });

    test('handles only direct mappings', () => {
      const result = normalizeDependencies({
        baseUrl: 'https://example.com/',
        files: [],
        'lib/a.lua': 'https://other.com/a.lua',
        'lib/b.lua': 'https://other.com/b.lua',
      });

      expect(result).toEqual({
        'lib/a.lua': 'https://other.com/a.lua',
        'lib/b.lua': 'https://other.com/b.lua',
      });
    });

    test('later sources overwrite earlier for same path', () => {
      const result = normalizeDependencies([
        { baseUrl: 'https://old.com/', files: ['lib/a.lua'] },
        { baseUrl: 'https://new.com/', files: ['lib/a.lua'] },
      ]);

      expect(result['lib/a.lua']).toBe('https://new.com/lib/a.lua');
    });
  });
});
