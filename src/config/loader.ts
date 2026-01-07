import { join } from "node:path";
import { MoonpackError } from "../utils/errors.ts";
import { type MoonpackConfig, type RawConfig, validateConfig } from "./schema.ts";

const CONFIG_FILENAME = "moonpack.json";

export interface LoadedConfig {
  config: MoonpackConfig;
  configPath: string;
  projectRoot: string;
}

/** Loads and validates moonpack.json from the given directory. */
export async function loadConfig(directory: string): Promise<LoadedConfig> {
  const configPath = join(directory, CONFIG_FILENAME);
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    throw new MoonpackError(
      `Could not find ${CONFIG_FILENAME} in ${directory}`,
      "CONFIG_NOT_FOUND",
      { directory, configPath }
    );
  }

  let parsed: RawConfig;
  try {
    parsed = (await file.json()) as RawConfig;
  } catch (error) {
    throw new MoonpackError(
      `Failed to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      "CONFIG_PARSE_ERROR",
      { configPath, error }
    );
  }

  const config = validateConfig(parsed, configPath);

  return {
    config,
    configPath,
    projectRoot: directory,
  };
}
