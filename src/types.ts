export type ExtendConfig = string | [string, ...unknown[]];

export interface TConfig {
  extends?: ExtendConfig[];
  scripts: TScripts;
  config?: {
    defaultHelpBehavior?: "help" | "interactive";
    defaultNoArgsBehavior?: "help" | "interactive";
  };
}

// a record can't be used here because it doesn't allow for circular references
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface TScripts {
  [key: string]: TScript;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type TFunction = Function;
export type TScript = string | TScript[] | TScripts | TFunction;

export type TError =
  | {
      code: number;
      function?: undefined;
      script: string;
    }
  | {
      code: undefined;
      function: Error;
      script: string;
    };
