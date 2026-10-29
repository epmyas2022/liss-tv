import fs from "node:fs";
import path from "node:path";

export type LogLevel = "success" | "warning" | "error";

export interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
  durationMs?: number;
}

export interface LogSink {
  emit(payload: LogPayload): void;
}

const ANSI_COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
} as const;

/**
 * Formats and prints logs to standard console output with ANSI color highlighting.
 */
export class ConsoleLogSink implements LogSink {
  public emit(payload: LogPayload): void {
    const { level, message, timestamp, context, metadata, error, durationMs } = payload;

    const color =
      level === "success"
        ? ANSI_COLORS.green
        : level === "warning"
          ? ANSI_COLORS.yellow
          : ANSI_COLORS.red;

    const levelTag = `${color}${ANSI_COLORS.bold}[${level.toUpperCase()}]${ANSI_COLORS.reset}`;
    const timeTag = `${ANSI_COLORS.gray}${timestamp}${ANSI_COLORS.reset}`;
    const contextTag = context ? `${ANSI_COLORS.cyan}[${context}]${ANSI_COLORS.reset} ` : "";
    const durationTag =
      typeof durationMs === "number"
        ? ` ${ANSI_COLORS.gray}(${durationMs.toFixed(1)}ms)${ANSI_COLORS.reset}`
        : "";

    const line = `${timeTag} ${levelTag} ${contextTag}${message}${durationTag}`;

    if (level === "error") {
      console.error(line);
      if (error) {
        console.error(error);
      }
    } else if (level === "warning") {
      console.warn(line);
    } else {
      console.log(line);
    }

    if (metadata && Object.keys(metadata).length > 0) {
      console.debug(`${ANSI_COLORS.gray}  → Metadata:${ANSI_COLORS.reset}`, metadata);
    }
  }
}

/**
 * Appends plain text structured log records to logger.log in the project root.
 */
export class FileLogSink implements LogSink {
  private logFilePath: string;

  constructor(fileName = "logger.log") {
    this.logFilePath = path.resolve(process.cwd(), fileName);
  }

  public emit(payload: LogPayload): void {
    if (typeof window !== "undefined") {
      return;
    }

    const { level, message, timestamp, context, metadata, error, durationMs } = payload;
    const contextSegment = context ? ` [${context}]` : "";
    const durationSegment = typeof durationMs === "number" ? ` (${durationMs.toFixed(1)}ms)` : "";
    let line = `[${timestamp}] [${level.toUpperCase()}]${contextSegment} ${message}${durationSegment}`;

    if (metadata && Object.keys(metadata).length > 0) {
      try {
        line += ` | metadata: ${JSON.stringify(metadata)}`;
      } catch {
        line += " | metadata: [Circular or Unserializable]";
      }
    }

    if (error) {
      if (error instanceof Error) {
        line += ` | error: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
      } else {
        line += ` | error: ${String(error)}`;
      }
    }

    line += "\n";

    try {
      fs.appendFileSync(this.logFilePath, line, "utf8");
    } catch (writeError) {
      console.error("Failed to write to log file:", writeError);
    }
  }
}

export interface InstrumentOptions {
  context?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Core Instrumentation Logger providing telemetry, operation measurement,
 * and multi-sink log dispatching.
 */
export class Instrumentation {
  private sinks: LogSink[] = [];

  constructor(sinks: LogSink[] = [new ConsoleLogSink(), new FileLogSink()]) {
    this.sinks = sinks;
  }

  public addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  public record(payload: Omit<LogPayload, "timestamp">): void {
    const fullPayload: LogPayload = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    for (const sink of this.sinks) {
      try {
        sink.emit(fullPayload);
      } catch (err) {
        console.error("Error in log sink:", err);
      }
    }
  }

  public success(
    message: string,
    metadata?: Record<string, unknown>,
    context?: string,
  ): void {
    this.record({
      level: "success",
      message,
      metadata,
      context,
    });
  }

  public warning(
    message: string,
    metadata?: Record<string, unknown>,
    context?: string,
  ): void {
    this.record({
      level: "warning",
      message,
      metadata,
      context,
    });
  }

  public error(
    message: string,
    error?: unknown,
    metadata?: Record<string, unknown>,
    context?: string,
  ): void {
    this.record({
      level: "error",
      message,
      error,
      metadata,
      context,
    });
  }

  /**
   * Instruments any synchronous or asynchronous unit of work, automatically
   * tracking duration and recording success or error telemetry.
   */
  public async instrument<T>(
    operationName: string,
    operation: () => Promise<T> | T,
    options?: InstrumentOptions,
  ): Promise<T> {
    const startTime = performance.now();
    const context = options?.context || "Instrumentation";

    try {
      const result = await operation();
      const durationMs = performance.now() - startTime;
      this.record({
        level: "success",
        message: `Operation "${operationName}" completed successfully`,
        context,
        durationMs,
        metadata: options?.metadata,
      });
      return result;
    } catch (error) {
      const durationMs = performance.now() - startTime;
      this.record({
        level: "error",
        message: `Operation "${operationName}" failed`,
        error,
        context,
        durationMs,
        metadata: options?.metadata,
      });
      throw error;
    }
  }

  /**
   * Creates a scoped logger with a preset context tag.
   */
  public createScope(context: string) {
    return {
      success: (message: string, metadata?: Record<string, unknown>) =>
        this.success(message, metadata, context),
      warning: (message: string, metadata?: Record<string, unknown>) =>
        this.warning(message, metadata, context),
      error: (message: string, error?: unknown, metadata?: Record<string, unknown>) =>
        this.error(message, error, metadata, context),
      instrument: <T>(
        operationName: string,
        operation: () => Promise<T> | T,
        options?: Omit<InstrumentOptions, "context">,
      ) => this.instrument(operationName, operation, { ...options, context }),
    };
  }
}

export const bitacora = new Instrumentation();
export default bitacora;
