import { MoonpackError } from "../utils/errors.ts";

export interface MoonpackConfig {
  name: string;
  version?: string | undefined;
  entry: string;
  outDir: string;
  external: string[];
}

export interface RawConfig {
  name?: unknown;
  version?: unknown;
  entry?: unknown;
  outDir?: unknown;
  external?: unknown;
}

export function validateConfig(raw: RawConfig, configPath: string): MoonpackConfig {
  const errors: string[] = [];

  if (typeof raw.name !== "string" || raw.name.length === 0) {
    errors.push("'name' is required and must be a non-empty string");
  }

  if (typeof raw.entry !== "string" || raw.entry.length === 0) {
    errors.push("'entry' is required and must be a non-empty string");
  }

  if (raw.version !== undefined && typeof raw.version !== "string") {
    errors.push("'version' must be a string if provided");
  }

  if (raw.outDir !== undefined && typeof raw.outDir !== "string") {
    errors.push("'outDir' must be a string if provided");
  }

  if (raw.external !== undefined) {
    if (!Array.isArray(raw.external)) {
      errors.push("'external' must be an array of strings if provided");
    } else if (!raw.external.every((item): item is string => typeof item === "string")) {
      errors.push("'external' must contain only strings");
    }
  }

  if (errors.length > 0) {
    throw new MoonpackError(
      `Invalid config at ${configPath}:\n  - ${errors.join("\n  - ")}`,
      "INVALID_CONFIG",
      { errors, configPath }
    );
  }

  return {
    name: raw.name as string,
    version: raw.version as string | undefined,
    entry: raw.entry as string,
    outDir: typeof raw.outDir === "string" ? raw.outDir : "dist",
    external: Array.isArray(raw.external) ? (raw.external as string[]) : [],
  };
}
