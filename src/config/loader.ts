import { join } from 'node:path';
import { MoonpackError } from '../utils/errors.ts';
import { type MoonpackConfig, type RawConfig, validateConfig } from './schema.ts';

const CONFIG_FILENAME = 'moonpack.json';
const LOCAL_CONFIG_FILENAME = 'moonpack.local.json';

export interface LoadedConfig {
  config: MoonpackConfig;
  configPath: string;
  projectRoot: string;
}

/** Loads moonpack.json and merges with moonpack.local.json if present. */
export async function loadConfig(directory: string): Promise<LoadedConfig> {
  const configPath = join(directory, CONFIG_FILENAME);
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    throw new MoonpackError(
      `Could not find ${CONFIG_FILENAME} in ${directory}`,
      'CONFIG_NOT_FOUND',
      { directory, configPath }
    );
  }

  let parsed: RawConfig;
  try {
    parsed = (await file.json()) as RawConfig;
  } catch (error) {
    throw new MoonpackError(
      `Failed to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIG_PARSE_ERROR',
      { configPath, error }
    );
  }

  const localConfig = await loadLocalConfig(directory);
  const merged = { ...parsed, ...localConfig };

  const config = validateConfig(merged, configPath);

  return {
    config,
    configPath,
    projectRoot: directory,
  };
}

async function loadLocalConfig(directory: string): Promise<Partial<RawConfig>> {
  const localPath = join(directory, LOCAL_CONFIG_FILENAME);
  const file = Bun.file(localPath);

  if (!(await file.exists())) {
    return {};
  }

  try {
    return (await file.json()) as Partial<RawConfig>;
  } catch (error) {
    throw new MoonpackError(
      `Failed to parse ${localPath}: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIG_PARSE_ERROR',
      { configPath: localPath, error }
    );
  }
}
