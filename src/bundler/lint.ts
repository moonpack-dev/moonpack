import type { DependencyGraph } from './graph.ts';
import { findAllCommentSpans, findAllStringSpans, isInsideRange } from './parser.ts';

export interface ExternalAssignment {
  moduleName: string;
  filePath: string;
  line: number;
  varName: string;
  propertyPath: string;
}

export interface DuplicateAssignmentWarning {
  propertyPath: string;
  assignments: ExternalAssignment[];
}

export interface MoonLoaderEventInModuleWarning {
  eventName: string;
  filePath: string;
  line: number;
}

export interface LintResult {
  duplicateAssignments: DuplicateAssignmentWarning[];
  moonloaderEventsInModules: MoonLoaderEventInModuleWarning[];
}

const MOONLOADER_EVENTS = new Set([
  'main',
  'onExitScript',
  'onQuitGame',
  'onScriptLoad',
  'onScriptTerminate',
  'onSystemInitialized',
  'onScriptMessage',
  'onSystemMessage',
  'onReceivePacket',
  'onReceiveRpc',
  'onSendPacket',
  'onSendRpc',
  'onWindowMessage',
  'onStartNewGame',
  'onLoadGame',
  'onSaveGame',
]);

interface ExternalVarInfo {
  varName: string;
  externalModule: string;
}

const REQUIRE_ASSIGNMENT_PATTERNS = [
  /(?:local\s+)?(\w+)\s*=\s*require\s*\(\s*(['"])([^'"]+)\2\s*\)/g,
  /(?:local\s+)?(\w+)\s*=\s*require\s*(['"])([^'"]+)\2/g,
];

function isExternalModule(moduleName: string): boolean {
  return !moduleName.startsWith('./') && !moduleName.startsWith('../');
}

function parseExternalRequireAssignments(source: string): ExternalVarInfo[] {
  const results: ExternalVarInfo[] = [];

  for (const pattern of REQUIRE_ASSIGNMENT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      const varName = match[1];
      const moduleName = match[3];

      if (varName && moduleName && isExternalModule(moduleName)) {
        if (!results.some((r) => r.varName === varName && r.externalModule === moduleName)) {
          results.push({ varName, externalModule: moduleName });
        }
      }
    }
  }

  return results;
}

function parseExternalPropertyAssignments(
  source: string,
  filePath: string,
  externalVars: ExternalVarInfo[]
): ExternalAssignment[] {
  if (externalVars.length === 0) return [];

  const results: ExternalAssignment[] = [];
  const varNames = externalVars.map((v) => v.varName);
  const varToModule = new Map(externalVars.map((v) => [v.varName, v.externalModule]));

  const varPattern = varNames.map((v) => escapeRegex(v)).join('|');

  const patterns = [
    new RegExp(`(${varPattern})(\\.\\w+)+\\s*=`, 'g'),
    new RegExp(`function\\s+(${varPattern})(\\.\\w+)+\\s*\\(`, 'g'),
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const varName = match[1];
      const fullMatch = match[0];
      if (!varName) continue;

      const propertyPathMatch = fullMatch.match(
        new RegExp(`(${escapeRegex(varName)}(?:\\.\\w+)+)`)
      );
      if (!propertyPathMatch?.[1]) continue;

      const propertyPath = propertyPathMatch[1];
      const externalModule = varToModule.get(varName);
      if (!externalModule) continue;

      const lineNumber = getLineNumber(source, match.index);

      results.push({
        moduleName: externalModule,
        filePath,
        line: lineNumber,
        varName,
        propertyPath,
      });
    }
  }

  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLineNumber(source: string, position: number): number {
  let line = 1;
  for (let i = 0; i < position && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function parseMoonLoaderEvents(source: string, filePath: string): MoonLoaderEventInModuleWarning[] {
  const stringSpans = findAllStringSpans(source);
  const commentSpans = findAllCommentSpans(source, stringSpans);
  const excludedRanges = [...stringSpans, ...commentSpans];

  const results: MoonLoaderEventInModuleWarning[] = [];
  const pattern = /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (isInsideRange(match.index, excludedRanges)) {
      continue;
    }

    const funcName = match[1];
    if (funcName && MOONLOADER_EVENTS.has(funcName)) {
      const beforeMatch = source.substring(Math.max(0, match.index - 50), match.index);
      if (/local\s*$/.test(beforeMatch)) {
        continue;
      }

      results.push({
        eventName: funcName,
        filePath,
        line: getLineNumber(source, match.index),
      });
    }
  }

  return results;
}

/** Lints the dependency graph for common issues. */
export function lintGraph(graph: DependencyGraph): LintResult {
  const allAssignments: ExternalAssignment[] = [];
  const moonloaderEventsInModules: MoonLoaderEventInModuleWarning[] = [];

  for (const [moduleName, node] of graph.modules) {
    const externalVars = parseExternalRequireAssignments(node.source);
    const assignments = parseExternalPropertyAssignments(node.source, node.filePath, externalVars);
    allAssignments.push(...assignments);

    const isEntryPoint = moduleName === graph.entryPoint.moduleName;
    if (!isEntryPoint) {
      const events = parseMoonLoaderEvents(node.source, node.filePath);
      moonloaderEventsInModules.push(...events);
    }
  }

  const assignmentsByPath = new Map<string, ExternalAssignment[]>();
  for (const assignment of allAssignments) {
    const existing = assignmentsByPath.get(assignment.propertyPath) || [];
    existing.push(assignment);
    assignmentsByPath.set(assignment.propertyPath, existing);
  }

  const duplicateAssignments: DuplicateAssignmentWarning[] = [];
  for (const [propertyPath, assignments] of assignmentsByPath) {
    if (assignments.length > 1) {
      const uniqueFiles = new Set(assignments.map((a) => a.filePath));
      if (uniqueFiles.size > 1) {
        duplicateAssignments.push({ propertyPath, assignments });
      }
    }
  }

  return { duplicateAssignments, moonloaderEventsInModules };
}

export function formatLintWarnings(result: LintResult): string[] {
  const warnings: string[] = [];

  for (const dup of result.duplicateAssignments) {
    const locations = dup.assignments.map((a) => `  - ${a.filePath}:${a.line}`).join('\n');

    warnings.push(
      `Duplicate assignment to '${dup.propertyPath}' - last definition wins:\n${locations}`
    );
  }

  for (const event of result.moonloaderEventsInModules) {
    warnings.push(
      `MoonLoader event '${event.eventName}' in module has no effect (move to entry point): ${event.filePath}:${event.line}`
    );
  }

  return warnings;
}
