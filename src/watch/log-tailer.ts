import { join } from 'node:path';

const LOG_POLL_MS = 50;
const STACK_INDENT = '              ';
const VALID_LOG_TYPES = new Set(['error', 'warn', 'system', 'script', 'debug']);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type LogType = 'error' | 'warn' | 'system' | 'script' | 'debug';

export interface LogEntry {
  type: LogType;
  timestamp?: string | undefined;
  message: string;
}

export interface LogTailer {
  stop: () => void;
}

export interface LogTailerCallbacks {
  onLogs: (entries: LogEntry[]) => void;
}

/**
 * Tails the MoonLoader log file and emits parsed log entries for a specific script.
 * Returns null if the log file doesn't exist.
 */
export async function startLogTailer(
  outDir: string,
  scriptName: string,
  callbacks: LogTailerCallbacks
): Promise<LogTailer | null> {
  const logPath = join(outDir, 'moonloader.log');
  const file = Bun.file(logPath);

  if (!(await file.exists())) {
    return null;
  }

  let lastSize = file.size;
  let polling = true;

  const poll = async () => {
    while (polling) {
      await Bun.sleep(LOG_POLL_MS);
      if (!polling) break;

      const currentFile = Bun.file(logPath);
      const currentSize = currentFile.size;

      if (currentSize > lastSize) {
        const newContent = await currentFile.slice(lastSize, currentSize).text();
        lastSize = currentSize;
        const entries = processLogLines(newContent, scriptName);
        if (entries.length > 0) {
          callbacks.onLogs(entries);
        }
      } else if (currentSize < lastSize) {
        lastSize = currentSize;
      }
    }
  };

  poll();

  return {
    stop: () => {
      polling = false;
    },
  };
}

function isValidLogType(value: string): value is LogType {
  return VALID_LOG_TYPES.has(value);
}

function processLogLines(content: string, scriptName: string): LogEntry[] {
  const lines = content.split('\n');
  const scriptPattern = new RegExp(`^${escapeRegex(scriptName)}:`, 'i');
  const entries: LogEntry[] = [];

  let errorBuffer: { timestamp?: string | undefined; lines: string[] } | null = null;

  const flushError = () => {
    if (errorBuffer && errorBuffer.lines.length > 0) {
      entries.push({
        type: 'error',
        timestamp: errorBuffer.timestamp,
        message: errorBuffer.lines.join('\n'),
      });
      errorBuffer = null;
    }
  };

  for (const line of lines) {
    const timestampMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\.\d+\]/);
    const timestamp = timestampMatch?.[1];

    const logMatch = line.match(/\((\w+)\)\s+(.+)/);
    const logTypeRaw = logMatch?.[1];
    const logMessage = logMatch?.[2];

    const logType = logTypeRaw && isValidLogType(logTypeRaw) ? logTypeRaw : undefined;
    const isRelevant = logMessage ? scriptPattern.test(logMessage) : false;

    if (errorBuffer && timestampMatch) {
      flushError();
    }

    if (logMessage?.includes('Script died')) {
      continue;
    }

    if (logType === 'error' && isRelevant) {
      errorBuffer = { timestamp, lines: [logMessage!] };
    } else if (errorBuffer) {
      if (
        line.trim().startsWith('stack traceback:') ||
        line.trim().startsWith('...') ||
        line.includes(': in ')
      ) {
        errorBuffer.lines.push(STACK_INDENT + line);
      }
    } else if (logType && logMessage && isRelevant) {
      entries.push({ type: logType, timestamp, message: logMessage });
    }
  }

  flushError();

  return entries;
}
