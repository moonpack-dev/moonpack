import { describe, expect, test } from 'bun:test';
import {
  autoLocalizeFunctions,
  parseRequireStatements,
  transformRequiresToLoad,
} from './parser.ts';

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

describe('autoLocalizeFunctions', () => {
  describe('basic localization', () => {
    test('adds local to simple function declaration', () => {
      const source = `function foo() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function foo() end`);
    });

    test('adds local to multiple functions', () => {
      const source = `function foo() end
function bar() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function foo() end
local function bar() end`);
    });

    test('handles function with parameters', () => {
      const source = `function add(a, b) return a + b end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function add(a, b) return a + b end`);
    });

    test('handles function with underscores', () => {
      const source = `function my_helper_func() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function my_helper_func() end`);
    });

    test('handles function with numbers in name', () => {
      const source = `function handler123() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function handler123() end`);
    });

    test('handles function with leading underscore', () => {
      const source = `function _private() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function _private() end`);
    });

    test('handles function at start of file', () => {
      const source = `function main() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function main() end`);
    });

    test('handles indented function', () => {
      const source = `    function helper() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`    local function helper() end`);
    });
  });

  describe('already local functions', () => {
    test('does not modify already local functions', () => {
      const source = `local function foo() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function foo() end`);
    });

    test('handles multiple spaces between local and function', () => {
      const source = `local      function foo() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local      function foo() end`);
    });

    test('handles tab between local and function', () => {
      const source = `local\tfunction foo() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local\tfunction foo() end`);
    });

    test('returns unchanged if no functions to localize', () => {
      const source = `local x = 1
local function foo() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(source);
    });
  });

  describe('dotted and method syntax (should NOT localize)', () => {
    test('does not modify function with dot in name', () => {
      const source = `function sampev.onServerMessage() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`function sampev.onServerMessage() end`);
    });

    test('does not modify function with multiple dots', () => {
      const source = `function a.b.c() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`function a.b.c() end`);
    });

    test('does not modify colon method syntax', () => {
      const source = `function Player:getName() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`function Player:getName() end`);
    });

    test('does not modify colon method with dots', () => {
      const source = `function game.Player:spawn(x, y, z) end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`function game.Player:spawn(x, y, z) end`);
    });

    test('handles mixed simple and dotted functions', () => {
      const source = `function helper() end
function sampev.onChat() end
function utils() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function helper() end
function sampev.onChat() end
local function utils() end`);
    });
  });

  describe('anonymous functions (should NOT localize)', () => {
    test('does not modify anonymous function assignment', () => {
      const source = `local f = function() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local f = function() end`);
    });

    test('does not modify anonymous function with params', () => {
      const source = `local add = function(a, b) return a + b end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local add = function(a, b) return a + b end`);
    });

    test('does not modify anonymous function in table', () => {
      const source = `local t = { callback = function() end }`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local t = { callback = function() end }`);
    });
  });

  describe('strings and comments (should NOT localize)', () => {
    test('does not modify function inside double-quoted string', () => {
      const source = `local s = "function foo() end"`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local s = "function foo() end"`);
    });

    test('does not modify function inside single-quoted string', () => {
      const source = `local s = 'function foo() end'`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local s = 'function foo() end'`);
    });

    test('does not modify function inside multiline string', () => {
      const source = `local s = [[function foo() end]]`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local s = [[function foo() end]]`);
    });

    test('does not modify function inside long bracket string', () => {
      const source = `local s = [=[function foo() end]=]`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local s = [=[function foo() end]=]`);
    });

    test('does not modify function inside line comment', () => {
      const source = `-- function foo() end
function bar() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`-- function foo() end
local function bar() end`);
    });

    test('does not modify function inside block comment', () => {
      const source = `--[[function foo() end]]
function bar() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`--[[function foo() end]]
local function bar() end`);
    });

    test('does not modify function inside multiline block comment', () => {
      const source = `--[[
function foo() end
]]
function bar() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`--[[
function foo() end
]]
local function bar() end`);
    });
  });

  describe('word boundary protection', () => {
    test('does not match myfunction identifier', () => {
      const source = `local myfunction = 1`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local myfunction = 1`);
    });

    test('does not match xfunction identifier', () => {
      const source = `local xfunction = true`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local xfunction = true`);
    });
  });

  describe('complex scenarios', () => {
    test('handles nested functions', () => {
      const source = `function outer()
    function inner() end
end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function outer()
    local function inner() end
end`);
    });

    test('handles multiple functions on same line', () => {
      const source = `function a() end function b() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local function a() end local function b() end`);
    });

    test('handles function after semicolon', () => {
      const source = `local x = 1; function foo() end`;
      const result = autoLocalizeFunctions(source);
      expect(result).toBe(`local x = 1; local function foo() end`);
    });

    test('handles real-world module pattern (localizes all simple functions)', () => {
      const source = `local sampev = require("lib.samp.events")

function helper()
    print("helper")
end

function process(data)
    return data
end

function sampev.onServerMessage(color, text)
    return true
end

function M.export()
    return helper()
end`;
      const result = autoLocalizeFunctions(source);

      expect(result).toContain('local function helper()');
      expect(result).toContain('local function process(');
      expect(result).toContain('function sampev.onServerMessage(');
      expect(result).toContain('function M.export()');

      expect(result).not.toContain('local function sampev.');
      expect(result).not.toContain('local function M.');
    });
  });
});
