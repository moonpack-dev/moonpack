import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createFileStructure, createTempDir, type TempDir } from "../test-utils.ts";
import { getModuleNameFromPath, type ResolveContext, resolveModulePath } from "./resolver.ts";

describe("resolveModulePath", () => {
  let tempDir: TempDir;
  let context: ResolveContext;

  beforeEach(async () => {
    tempDir = await createTempDir();
    context = {
      sourceRoot: tempDir.path,
      external: new Set(["samp", "imgui", "moonloader"]),
    };
  });

  afterEach(async () => {
    await tempDir.cleanup();
  });

  describe("direct file resolution", () => {
    test("resolves module.lua in source root", async () => {
      await createFileStructure(tempDir.path, {
        "utils.lua": "return {}",
      });

      const result = await resolveModulePath("utils", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe("utils");
      expect(result.resolved!.filePath).toContain("utils.lua");
    });

    test("resolves nested module with dots", async () => {
      await createFileStructure(tempDir.path, {
        "core/utils/logger.lua": "return {}",
      });

      const result = await resolveModulePath("core.utils.logger", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe("core.utils.logger");
      expect(result.resolved!.filePath).toContain("core/utils/logger.lua");
    });

    test("resolves deeply nested module", async () => {
      await createFileStructure(tempDir.path, {
        "a/b/c/d/e.lua": "return {}",
      });

      const result = await resolveModulePath("a.b.c.d.e", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe("a.b.c.d.e");
    });
  });

  describe("init.lua resolution", () => {
    test("resolves module/init.lua when direct file not found", async () => {
      await createFileStructure(tempDir.path, {
        "mymodule/init.lua": "return {}",
      });

      const result = await resolveModulePath("mymodule", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.filePath).toContain("mymodule/init.lua");
    });

    test("resolves nested module/init.lua", async () => {
      await createFileStructure(tempDir.path, {
        "core/utils/init.lua": "return {}",
      });

      const result = await resolveModulePath("core.utils", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.filePath).toContain("core/utils/init.lua");
    });
  });

  describe("precedence: direct file over init.lua", () => {
    test("prefers module.lua over module/init.lua", async () => {
      await createFileStructure(tempDir.path, {
        "utils.lua": "return { type = 'direct' }",
        "utils/init.lua": "return { type = 'init' }",
      });

      const result = await resolveModulePath("utils", context);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.filePath).toMatch(/utils\.lua$/);
      expect(result.resolved!.filePath).not.toContain("init.lua");
    });
  });

  describe("external modules", () => {
    test("marks exact external match as external", async () => {
      const result = await resolveModulePath("samp", context);
      expect(result.isExternal).toBe(true);
      expect(result.resolved).toBeNull();
    });

    test("marks external prefix match as external", async () => {
      const result = await resolveModulePath("samp.events", context);
      expect(result.isExternal).toBe(true);
      expect(result.resolved).toBeNull();
    });

    test("marks deep external prefix as external", async () => {
      const result = await resolveModulePath("moonloader.utils.events", context);
      expect(result.isExternal).toBe(true);
      expect(result.resolved).toBeNull();
    });

    test("does not match partial prefix", async () => {
      await createFileStructure(tempDir.path, {
        "sampler.lua": "return {}",
      });

      const result = await resolveModulePath("sampler", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
      expect(result.resolved!.moduleName).toBe("sampler");
    });

    test("does not match when external is substring", async () => {
      await createFileStructure(tempDir.path, {
        "imguihelper.lua": "return {}",
      });

      const result = await resolveModulePath("imguihelper", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
    });
  });

  describe("module not found", () => {
    test("returns null resolved when module does not exist", async () => {
      const result = await resolveModulePath("nonexistent", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).toBeNull();
    });

    test("returns null for nested nonexistent module", async () => {
      const result = await resolveModulePath("does.not.exist", context);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).toBeNull();
    });
  });

  describe("empty external set", () => {
    test("resolves all modules as local when no externals", async () => {
      const noExternalContext: ResolveContext = {
        sourceRoot: tempDir.path,
        external: new Set(),
      };

      await createFileStructure(tempDir.path, {
        "samp.lua": "return {}",
      });

      const result = await resolveModulePath("samp", noExternalContext);
      expect(result.isExternal).toBe(false);
      expect(result.resolved).not.toBeNull();
    });
  });
});

describe("getModuleNameFromPath", () => {
  const sourceRoot = "/project/src";

  test("converts simple file path to module name", () => {
    const result = getModuleNameFromPath("/project/src/utils.lua", sourceRoot);
    expect(result).toBe("utils");
  });

  test("converts nested path to dotted module name", () => {
    const result = getModuleNameFromPath("/project/src/core/utils/logger.lua", sourceRoot);
    expect(result).toBe("core.utils.logger");
  });

  test("handles init.lua by removing it from module name", () => {
    const result = getModuleNameFromPath("/project/src/mymodule/init.lua", sourceRoot);
    expect(result).toBe("mymodule");
  });

  test("handles nested init.lua", () => {
    const result = getModuleNameFromPath("/project/src/core/utils/init.lua", sourceRoot);
    expect(result).toBe("core.utils");
  });

  test("handles deeply nested paths", () => {
    const result = getModuleNameFromPath("/project/src/a/b/c/d/e.lua", sourceRoot);
    expect(result).toBe("a.b.c.d.e");
  });

  test("handles source root with trailing slash", () => {
    const result = getModuleNameFromPath("/project/src/utils.lua", "/project/src/");
    expect(result).toBe("utils");
  });
});
