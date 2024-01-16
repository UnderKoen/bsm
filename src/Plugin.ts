import { TScript, TScripts } from "./types";

type PromiseOrNot<T> = T | Promise<T>;

export abstract class Plugin {
  public abstract isExecutable(script: TScripts): PromiseOrNot<boolean>;

  public abstract execute(
    script: TScripts,
  ): PromiseOrNot<void> | PromiseOrNot<TScript>;

  public abstract readonly path: string | undefined;
}

export class SimplePlugin extends Plugin {
  public readonly path: string | undefined;

  constructor(
    public field: string,
    public isExecutableFn?: (script: TScripts) => PromiseOrNot<boolean>,
  ) {
    super();
    this.path = field;
  }

  isExecutable(script: TScripts): PromiseOrNot<boolean> {
    if (!Object.hasOwn(script, this.field)) return false;
    return this.isExecutableFn ? this.isExecutableFn(script) : true;
  }

  execute(script: TScripts): PromiseOrNot<TScript> {
    return script[this.field];
  }
}
