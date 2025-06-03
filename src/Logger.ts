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
}
