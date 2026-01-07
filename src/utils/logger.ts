export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(): Logger {
  return {
    info(message: string): void {
      console.log(message);
    },
    warn(message: string): void {
      console.warn(`⚠ ${message}`);
    },
    error(message: string): void {
      console.error(`✖ ${message}`);
    },
  };
}
