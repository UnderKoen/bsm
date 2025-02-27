export class BsmError extends Error {
  constructor(
    public readonly code: number,
    public readonly script: string,
  ) {
    super();
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
