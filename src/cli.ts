#!/usr/bin/env bun
import { build } from "./commands/build.ts";
import { formatError, MoonpackError } from "./utils/errors.ts";
import { createLogger } from "./utils/logger.ts";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "build") {
    await runBuild();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Run "moonpack help" for usage information.');
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`moonpack - Build tool for MoonLoader Lua scripts

Usage:
  moonpack <command>

Commands:
  build    Bundle source files into a single Lua file
  help     Show this help message

Examples:
  moonpack build    Build the project in the current directory
`);
}

async function runBuild(): Promise<void> {
  const logger = createLogger();

  try {
    const result = await build({
      cwd: process.cwd(),
      logger,
    });

    if (result.success) {
      logger.info("Build completed successfully!");
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    logger.error(formatError(error));
    if (error instanceof MoonpackError && error.details) {
      const details = error.details;
      if ("cycle" in details) {
        logger.error("Fix the circular dependency to continue.");
      }
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
