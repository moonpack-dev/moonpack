import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createFileStructure, createTempDir, type TempDir } from '../test-utils.ts';
import { getModuleNameFromPath, type ResolveContext, resolveModulePath } from './resolver.ts';

describe('resolveModulePath', () => {
  let tempDir: TempDir;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await tempDir.cleanup();
  });

  function createContext(currentFile: string): ResolveContext {
    return {
      sourceRoot: tempDir.path,
      currentFile,
    };
  }

  describe('relative path resolution', () => {
    test('resolves ./module in same directory', async () => {
      await createFileStructure(tempDir.path, {
        'main.lua': 'local utils = require("./utils")',
        'utils.lua': 'return {}',
      });

      const context = createContext(join(tempDir.path, 'main.lua'));
      const result = await resolveModulePath('./utils', context);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe('utils');
      expect(result.resolved!.filePath).toContain('utils.lua');
    });

    test('resolves ./nested/module', async () => {
      await createFileStructure(tempDir.path, {
        'main.lua': 'local config = require("./core/config")',
        'core/config.lua': 'return {}',
      });

      const context = createContext(join(tempDir.path, 'main.lua'));
      const result = await resolveModulePath('./core/config', context);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe('core/config');
      expect(result.resolved!.filePath).toContain('core/config.lua');
    });

    test('resolves ../module from nested file', async () => {
      await createFileStructure(tempDir.path, {
        'utils.lua': 'return {}',
        'core/main.lua': 'local utils = require("../utils")',
      });

      const context = createContext(join(tempDir.path, 'core/main.lua'));
      const result = await resolveModulePath('../utils', context);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe('utils');
      expect(result.resolved!.filePath).toContain('utils.lua');
    });

    test('resolves sibling module from nested directory', async () => {
      await createFileStructure(tempDir.path, {
        'core/utils.lua': 'return {}',
        'core/config.lua': 'local utils = require("./utils")',
      });

      const context = createContext(join(tempDir.path, 'core/config.lua'));
      const result = await resolveModulePath('./utils', context);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe('core/utils');
    });
  });

  describe('init.lua resolution', () => {
    test('resolves ./module to module/init.lua when direct file not found', async () => {
      await createFileStructure(tempDir.path, {
        'main.lua': '',
        'mymodule/init.lua': 'return {}',
      });

      const context = createContext(join(tempDir.path, 'main.lua'));
      const result = await resolveModulePath('./mymodule', context);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe('mymodule');
      expect(result.resolved!.filePath).toContain('mymodule/init.lua');
    });

    test('prefers direct .lua file over init.lua', async () => {
      await createFileStructure(tempDir.path, {
        'main.lua': '',
        'utils.lua': "return { type = 'direct' }",
        'utils/init.lua': "return { type = 'init' }",
      });

      const context = createContext(join(tempDir.path, 'main.lua'));
      const result = await resolveModulePath('./utils', context);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.filePath).toMatch(/utils\.lua$/);
      expect(result.resolved!.filePath).not.toContain('init.lua');
    });
  });

  describe('module not found', () => {
    test('returns null resolved when module does not exist', async () => {
      await createFileStructure(tempDir.path, {
        'main.lua': '',
      });

      const context = createContext(join(tempDir.path, 'main.lua'));
      const result = await resolveModulePath('./nonexistent', context);
      expect(result.resolved).toBeNull();
    });

    test('returns null for nested nonexistent module', async () => {
      await createFileStructure(tempDir.path, {
        'main.lua': '',
      });

      const context = createContext(join(tempDir.path, 'main.lua'));
      const result = await resolveModulePath('./does/not/exist', context);
      expect(result.resolved).toBeNull();
    });
  });
});

describe('getModuleNameFromPath', () => {
  const sourceRoot = '/project/src';

  test('converts simple file path to module name', () => {
    const result = getModuleNameFromPath('/project/src/utils.lua', sourceRoot);
    expect(result).toBe('utils');
  });

  test('converts nested path to slash-separated module name', () => {
    const result = getModuleNameFromPath('/project/src/core/utils/logger.lua', sourceRoot);
    expect(result).toBe('core/utils/logger');
  });

  test('handles init.lua by removing it from module name', () => {
    const result = getModuleNameFromPath('/project/src/mymodule/init.lua', sourceRoot);
    expect(result).toBe('mymodule');
  });

  test('handles nested init.lua', () => {
    const result = getModuleNameFromPath('/project/src/core/utils/init.lua', sourceRoot);
    expect(result).toBe('core/utils');
  });

  test('handles deeply nested paths', () => {
    const result = getModuleNameFromPath('/project/src/a/b/c/d/e.lua', sourceRoot);
    expect(result).toBe('a/b/c/d/e');
  });
});
