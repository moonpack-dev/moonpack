import { describe, expect, test } from 'bun:test';
import { parseRequireStatements, transformRequiresToLoad } from './parser.ts';

describe('parseRequireStatements', () => {
  describe('standard require syntax', () => {
    test('parses require with double quotes', () => {
      const source = `local mod = require("mymodule")`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
      expect(result[0].type).toBe('standard');
    });

    test('parses require with single quotes', () => {
      const source = `local mod = require('mymodule')`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
      expect(result[0].type).toBe('standard');
    });

    test('parses require with spaces inside parens', () => {
      const source = `local mod = require( "mymodule" )`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
    });

    test('parses dotted module names', () => {
      const source = `local mod = require("core.utils.logger")`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('core.utils.logger');
    });

    test('parses require with property access', () => {
      const source = `local fn = require("module").someFunction`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('module');
    });
  });

  describe('compact require syntax (no parentheses)', () => {
    test('parses require with single quotes no parens', () => {
      const source = `local mod = require 'mymodule'`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
      expect(result[0].type).toBe('compact');
    });

    test('parses require with double quotes no parens', () => {
      const source = `local mod = require "mymodule"`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
      expect(result[0].type).toBe('compact');
    });

    test('parses compact require with no space', () => {
      const source = `local mod = require'mymodule'`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
      expect(result[0].type).toBe('compact');
    });
  });

  describe('pcall wrapped require', () => {
    test('parses pcall require with double quotes', () => {
      const source = `local ok, mod = pcall(require, "mymodule")`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
      expect(result[0].type).toBe('pcall');
    });

    test('parses pcall require with single quotes', () => {
      const source = `local ok, mod = pcall(require, 'mymodule')`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
      expect(result[0].type).toBe('pcall');
    });

    test('parses pcall require with spaces', () => {
      const source = `local ok, mod = pcall( require , "mymodule" )`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('mymodule');
    });
  });

  describe('multiple requires', () => {
    test('parses multiple requires on separate lines', () => {
      const source = `
local a = require("moduleA")
local b = require('moduleB')
local c = require "moduleC"
            `.trim();
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.moduleName)).toEqual(['moduleA', 'moduleB', 'moduleC']);
    });

    test('parses multiple requires on same line', () => {
      const source = `local a, b = require("modA"), require("modB")`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(2);
      expect(result[0].moduleName).toBe('modA');
      expect(result[1].moduleName).toBe('modB');
    });
  });

  describe('string exclusion', () => {
    test('ignores require inside double-quoted string', () => {
      const source = `local s = "require('fake')"`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('ignores require inside single-quoted string', () => {
      const source = `local s = 'require("fake")'`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('ignores require inside multiline string', () => {
      const source = `local s = [[require("fake")]]`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('ignores require inside multiline string with equals', () => {
      const source = `local s = [=[require("fake")]=]`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('parses real require after string with fake require', () => {
      const source = `
local s = "require('fake')"
local real = require("real")
            `.trim();
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('real');
    });
  });

  describe('comment exclusion', () => {
    test('ignores require in line comment', () => {
      const source = `-- require("fake")`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('ignores require in block comment', () => {
      const source = `--[[ require("fake") ]]`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('ignores require in multiline block comment', () => {
      const source = `--[[
require("fake")
]]`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('parses require after comment on same line', () => {
      const source = `-- comment here
local mod = require("real")`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(1);
      expect(result[0].moduleName).toBe('real');
    });
  });

  describe('line and column tracking', () => {
    test('tracks line numbers correctly', () => {
      const source = `
local a = require("modA")
local b = require("modB")
local c = require("modC")
            `.trim();
      const result = parseRequireStatements(source);
      expect(result[0].line).toBe(1);
      expect(result[1].line).toBe(2);
      expect(result[2].line).toBe(3);
    });

    test('tracks column correctly', () => {
      const source = `local mod = require("test")`;
      const result = parseRequireStatements(source);
      expect(result[0].column).toBe(13);
    });
  });

  describe('edge cases', () => {
    test('handles empty source', () => {
      const result = parseRequireStatements('');
      expect(result).toHaveLength(0);
    });

    test('handles source with no requires', () => {
      const source = `
local x = 1
local y = 2
print(x + y)
            `.trim();
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });

    test('handles require-like but not require', () => {
      const source = `local required = "something"`;
      const result = parseRequireStatements(source);
      expect(result).toHaveLength(0);
    });
  });
});

describe('transformRequiresToLoad', () => {
  const bundledModules = new Set(['local.mod', 'utils', 'core.config']);

  describe('basic transformation', () => {
    test('transforms bundled module require', () => {
      const source = `local mod = require("local.mod")`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(`local mod = __load("local.mod")`);
    });

    test('preserves external module require', () => {
      const source = `local samp = require("samp.events")`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(`local samp = require("samp.events")`);
    });

    test('transforms compact require syntax', () => {
      const source = `local mod = require 'utils'`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(`local mod = __load('utils')`);
    });

    test('transforms pcall wrapped require', () => {
      const source = `local ok, mod = pcall(require, "utils")`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(`local ok, mod = pcall(__load, "utils")`);
    });

    test('preserves pcall with external module', () => {
      const source = `local ok, samp = pcall(require, "samp.events")`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(`local ok, samp = pcall(require, "samp.events")`);
    });
  });

  describe('mixed transformations', () => {
    test('transforms multiple requires correctly', () => {
      const source = `
local a = require("utils")
local b = require("samp.events")
local c = require("core.config")
            `.trim();
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toContain(`__load("utils")`);
      expect(result).toContain(`require("samp.events")`);
      expect(result).toContain(`__load("core.config")`);
    });
  });

  describe('preserves strings and comments', () => {
    test('does not transform require inside string', () => {
      const source = `local s = "require('utils')"
local real = require("utils")`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toContain(`"require('utils')"`);
      expect(result).toContain(`__load("utils")`);
    });

    test('does not transform require inside comment', () => {
      const source = `-- require("utils")
local real = require("utils")`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toContain(`-- require("utils")`);
      expect(result).toContain(`__load("utils")`);
    });
  });

  describe('quote preservation', () => {
    test('preserves single quotes', () => {
      const source = `local mod = require('utils')`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(`local mod = __load('utils')`);
    });

    test('preserves double quotes', () => {
      const source = `local mod = require("utils")`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(`local mod = __load("utils")`);
    });
  });

  describe('edge cases', () => {
    test('handles empty bundled modules set', () => {
      const source = `local mod = require("utils")`;
      const result = transformRequiresToLoad(source, new Set());
      expect(result).toBe(source);
    });

    test('handles source with no requires', () => {
      const source = `local x = 1`;
      const result = transformRequiresToLoad(source, bundledModules);
      expect(result).toBe(source);
    });
  });
});
