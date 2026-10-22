/**
 * Logger utility with configurable log levels
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export class Logger {
  private level: number;
  private prefix: string;
  
  constructor(prefix: string, level: LogLevel = 'info') {
    this.prefix = prefix;
    this.level = LEVELS[level];
  }
  
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LEVELS[level] >= this.level) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.prefix}]`;
      console.log(prefix, message, ...args);
    }
  }
  
  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }
  
  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }
  
  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }
  
  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }
}