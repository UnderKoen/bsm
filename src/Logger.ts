import { Events } from "./Events.js";

export class Logger {
  private static silent: boolean = false;

  public static silence(): void {
    this.silent = true;
  }

  public static log(...args: unknown[]): void {
    if (this.silent) return;
    console.log(...args);
  }

  public static error(...args: unknown[]): void {
    if (this.silent) return;
    console.error(...args);
  }

  /**
   * Prints a failure in red and records it as an `error` run event, so the
   * two can't drift apart. The event is written even when output is silenced.
   *
   * @param id the event node it belongs to; without one it belongs to the run
   * @param cause appended to the event message (it is usually printed separately)
   */
  public static fail(
    message: string,
    { id, cause }: { id?: string; cause?: unknown } = {},
  ): void {
    Logger.error(`\x1b[31m${message}\x1b[0m`);
    Events.error(
      id,
      cause instanceof Error ? `${message}: ${cause.message}` : message,
    );
  }
}
