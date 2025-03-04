export type ExtendConfig = string | [string, ...unknown[]];

export interface TConfig {
  extends?: ExtendConfig[];
  scripts: TScripts;
  config?: {
    defaultHelpBehavior?: "help" | "interactive";
    defaultNoArgsBehavior?: "help" | "interactive";
    idempotency?: {
      location?: string;
      useFileContent?: boolean;
    };
  };
}

// a record can't be used here because it doesn't allow for circular references
export interface TScripts {
  [key: string]: TScript;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type TFunction = Function;
export type TScript = string | TScript[] | TScripts | TFunction;
