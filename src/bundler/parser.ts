export interface RequireStatement {
  moduleName: string;
  line: number;
  column: number;
  raw: string;
  type: "standard" | "compact" | "pcall";
}

interface StringSpan {
  start: number;
  end: number;
}

interface CommentSpan {
  start: number;
  end: number;
}

interface RequireMatch {
  moduleName: string;
  raw: string;
  index: number;
  type: "standard" | "compact" | "pcall";
}

const REQUIRE_PATTERNS = [
  {
    pattern: /require\s*\(\s*(["'])([^"']+)\1\s*\)/g,
    type: "standard" as const,
    moduleGroup: 2,
  },
  {
    pattern: /require\s*(["'])([^"']+)\1/g,
    type: "compact" as const,
    moduleGroup: 2,
  },
  {
    pattern: /pcall\s*\(\s*require\s*,\s*(["'])([^"']+)\1\s*\)/g,
    type: "pcall" as const,
    moduleGroup: 2,
  },
];

/** Extracts all require statements from Lua source, handling standard, compact, and pcall syntax. Ignores requires inside strings and comments. */
export function parseRequireStatements(source: string): RequireStatement[] {
  const stringSpans = findAllStringSpans(source);
  const commentSpans = findAllCommentSpans(source, stringSpans);
  const excludedRanges = [...stringSpans, ...commentSpans];

  const allMatches: RequireMatch[] = [];

  for (const { pattern, type, moduleGroup } of REQUIRE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      if (isInsideRange(match.index, excludedRanges)) {
        continue;
      }

      const moduleName = match[moduleGroup];
      if (moduleName !== undefined) {
        if (type === "compact" && isPartOfStandardRequire(source, match.index, match[0])) {
          continue;
        }

        allMatches.push({
          moduleName,
          raw: match[0],
          index: match.index,
          type,
        });
      }
    }
  }

  allMatches.sort((a, b) => a.index - b.index);

  const deduped = deduplicateMatches(allMatches);

  return deduped.map((m) => {
    const position = getLineAndColumn(source, m.index);
    return {
      moduleName: m.moduleName,
      line: position.line,
      column: position.column,
      raw: m.raw,
      type: m.type,
    };
  });
}

function isPartOfStandardRequire(source: string, index: number, match: string): boolean {
  const afterMatch = source.substring(index + match.length);
  const beforeParenCheck = afterMatch.match(/^\s*\)/);
  return beforeParenCheck !== null;
}

function deduplicateMatches(matches: RequireMatch[]): RequireMatch[] {
  const result: RequireMatch[] = [];

  for (const match of matches) {
    const overlapping = result.find(
      (existing) =>
        (match.index >= existing.index && match.index < existing.index + existing.raw.length) ||
        (existing.index >= match.index && existing.index < match.index + match.raw.length)
    );

    if (overlapping) {
      if (match.raw.length > overlapping.raw.length) {
        const idx = result.indexOf(overlapping);
        result[idx] = match;
      }
    } else {
      result.push(match);
    }
  }

  return result;
}

function findAllStringSpans(source: string): StringSpan[] {
  const spans: StringSpan[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === '"' || char === "'") {
      const stringStart = i;
      const quote = char;
      i++;

      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          spans.push({ start: stringStart, end: i });
          break;
        }
        i++;
      }
    } else if (char === "[") {
      const bracketMatch = matchLongBracket(source, i);
      if (bracketMatch) {
        spans.push({ start: i, end: bracketMatch.end });
        i = bracketMatch.end;
      }
    }
    i++;
  }

  return spans;
}

function matchLongBracket(source: string, start: number): { end: number } | null {
  if (source[start] !== "[") return null;

  let level = 0;
  let i = start + 1;

  while (i < source.length && source[i] === "=") {
    level++;
    i++;
  }

  if (source[i] !== "[") return null;
  i++;

  const closePattern = "]" + "=".repeat(level) + "]";

  while (i < source.length) {
    const closeIndex = source.indexOf(closePattern, i);
    if (closeIndex === -1) return null;
    return { end: closeIndex + closePattern.length - 1 };
  }

  return null;
}

function findAllCommentSpans(source: string, stringSpans: StringSpan[]): CommentSpan[] {
  const spans: CommentSpan[] = [];
  let i = 0;

  while (i < source.length - 1) {
    if (source[i] === "-" && source[i + 1] === "-") {
      if (isInsideRange(i, stringSpans)) {
        i++;
        continue;
      }

      const commentStart = i;

      if (source[i + 2] === "[") {
        const bracketMatch = matchLongBracket(source, i + 2);
        if (bracketMatch) {
          spans.push({ start: commentStart, end: bracketMatch.end });
          i = bracketMatch.end + 1;
          continue;
        }
      }

      const lineEnd = source.indexOf("\n", i);
      const end = lineEnd === -1 ? source.length - 1 : lineEnd - 1;
      spans.push({ start: commentStart, end });
      i = lineEnd === -1 ? source.length : lineEnd + 1;
      continue;
    }
    i++;
  }

  return spans;
}

function isInsideRange(position: number, ranges: Array<{ start: number; end: number }>): boolean {
  for (const range of ranges) {
    if (position >= range.start && position <= range.end) {
      return true;
    }
  }
  return false;
}

function getLineAndColumn(source: string, position: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < position; i++) {
    if (source[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }

  return { line, column: position - lastNewline };
}

/** Replaces require() calls for bundled modules with __load() calls. External modules remain unchanged. */
export function transformRequiresToLoad(source: string, bundledModules: Set<string>): string {
  const stringSpans = findAllStringSpans(source);
  const commentSpans = findAllCommentSpans(source, stringSpans);
  const excludedRanges = [...stringSpans, ...commentSpans];

  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  for (const { pattern, type, moduleGroup } of REQUIRE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      if (isInsideRange(match.index, excludedRanges)) {
        continue;
      }

      const moduleName = match[moduleGroup];
      const quote = match[moduleGroup - 1];

      if (moduleName === undefined || quote === undefined) {
        continue;
      }

      if (type === "compact" && isPartOfStandardRequire(source, match.index, match[0])) {
        continue;
      }

      if (!bundledModules.has(moduleName)) {
        continue;
      }

      const matchIndex = match.index;
      const matchLength = match[0].length;
      const alreadyReplaced = replacements.some(
        (r) =>
          (matchIndex >= r.start && matchIndex < r.end) ||
          (r.start >= matchIndex && r.start < matchIndex + matchLength)
      );

      if (alreadyReplaced) {
        continue;
      }

      let replacement: string;
      if (type === "pcall") {
        replacement = `pcall(__load, ${quote}${moduleName}${quote})`;
      } else if (type === "compact") {
        replacement = `__load(${quote}${moduleName}${quote})`;
      } else {
        replacement = `__load(${quote}${moduleName}${quote})`;
      }

      replacements.push({
        start: matchIndex,
        end: matchIndex + matchLength,
        replacement,
      });
    }
  }

  if (replacements.length === 0) {
    return source;
  }

  replacements.sort((a, b) => b.start - a.start);

  let result = source;
  for (const r of replacements) {
    result = result.substring(0, r.start) + r.replacement + result.substring(r.end);
  }

  return result;
}
