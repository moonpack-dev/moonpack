import type { MoonpackConfig } from '../config/schema.ts';
import type { DependencyGraph } from './graph.ts';
import { autoLocalizeFunctions, transformRequiresToLoad } from './parser.ts';

export interface GenerateOptions {
  graph: DependencyGraph;
  config: MoonpackConfig;
}

/** Generates the final Lua bundle with module loader and all dependencies. */
export function generateBundle(options: GenerateOptions): string {
  const { graph, config } = options;

  const lines: string[] = [];

  lines.push(generateHeader(config));
  lines.push('');
  lines.push(generateModuleLoader());
  lines.push('');

  const nonEntryModules = graph.moduleOrder.filter((name) => name !== graph.entryPoint.moduleName);

  if (nonEntryModules.length > 0) {
    for (const moduleName of nonEntryModules) {
      const node = graph.modules.get(moduleName);
      if (node) {
        lines.push(generateModuleWrapper(moduleName, node.source, node.requireMappings));
        lines.push('');
      }
    }
  }

  const transformedEntrySource = transformRequiresToLoad(
    graph.entryPoint.source,
    graph.entryPoint.requireMappings
  );
  lines.push(transformedEntrySource);

  return lines.join('\n');
}

function escapeLuaString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function generateHeader(config: MoonpackConfig): string {
  const versionPart = config.version ? ` v${config.version}` : '';
  const lines: string[] = [
    `-- ${config.name}${versionPart}`,
    '-- Built with moonpack',
    '',
    `script_name('${escapeLuaString(config.name)}')`,
  ];

  if (config.version) {
    lines.push(`script_version('${escapeLuaString(config.version)}')`);
  }

  if (config.author) {
    if (Array.isArray(config.author)) {
      const authors = config.author.map((a) => `'${escapeLuaString(a)}'`).join(', ');
      lines.push(`script_authors(${authors})`);
    } else {
      lines.push(`script_author('${escapeLuaString(config.author)}')`);
    }
  }

  if (config.description) {
    lines.push(`script_description('${escapeLuaString(config.description)}')`);
  }

  if (config.url) {
    lines.push(`script_url('${escapeLuaString(config.url)}')`);
  }

  return lines.join('\n');
}

function generateModuleLoader(): string {
  return `local __modules = {}
local __loaded = {}

local function __load(name)
    if __loaded[name] then return __loaded[name] end
    if __modules[name] then
        __loaded[name] = __modules[name]()
        return __loaded[name]
    end
    return require(name)
end`;
}

function generateModuleWrapper(
  moduleName: string,
  source: string,
  requireMappings: Map<string, string>
): string {
  const localizedSource = autoLocalizeFunctions(source);
  const transformedSource = transformRequiresToLoad(localizedSource, requireMappings);
  const indentedSource = indentCode(transformedSource, '    ');

  return `__modules["${moduleName}"] = function()
${indentedSource}
end`;
}

function indentCode(code: string, indent: string): string {
  return code
    .split('\n')
    .map((line) => (line.length > 0 ? indent + line : line))
    .join('\n');
}
