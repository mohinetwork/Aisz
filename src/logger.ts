import pino, { type Logger } from "pino";

export function createLogger(level?: string): Logger {
  return pino({
    level: level ?? process.env.LOG_LEVEL ?? "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
