import os from "os";

export class BsmError extends Error {
  constructor(
    public readonly code: number,
    public readonly script: string,
    /** Set when the command was killed by a signal instead of exiting */
    public readonly signal?: NodeJS.Signals,
  ) {
    super();
  }

  /**
   * Node reports `code: null` when a process is killed by a signal. Use the
   * shell convention (128 + signal number) so there is always an exit code.
   */
  static fromExit(
    code: number | null,
    signal: NodeJS.Signals | null,
    script: string,
  ): BsmError {
    if (code !== null) return new BsmError(code, script);

    const number = signal ? os.constants.signals[signal] : undefined;
    return new BsmError(
      number === undefined ? 1 : 128 + number,
      script,
      signal ?? undefined,
    );
  }
}

export class BsmFunctionError extends BsmError {
  constructor(
    public readonly func: Error,
    public readonly script: string,
  ) {
    super(1, script);
  }
}
