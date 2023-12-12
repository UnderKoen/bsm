import { ExtendConfig, TConfig } from "./types";
import minimist from "minimist";
import { defu } from "defu";

type AdvanceConfig = (...args: unknown[]) => TConfig;

export const DEFAULT_CONFIG: Readonly<TConfig> = Object.freeze({
  scripts: {},
  config: {
    defaultHelpBehavior: "help",
  },
} as TConfig);

export class ConfigLoader {
  static getSource(config: ExtendConfig): string {
    if (Array.isArray(config)) return config[0];
    return config;
  }

  static loadExtensions(config: TConfig): TConfig[] {
    if (!Object.hasOwn(config, "extends") || !config.extends) return [];

    return [...config.extends]
      .map((c) => this.loadFile(c, false))
      .filter((c): c is TConfig => c !== undefined);
  }

  static loadFile(
    file: ExtendConfig | undefined,
    noBail = true,
  ): TConfig | undefined {
    if (!file) return undefined;
    let source = this.getSource(file);

    try {
      source = require.resolve(source, {
        paths: [process.cwd()],
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let config = require(source) as TConfig | AdvanceConfig;
      if (typeof config === "function") {
        config = config(...(Array.isArray(file) ? file.slice(1) : []));
      }

      const configs = this.loadExtensions(config);

      return defu(config, ...configs, DEFAULT_CONFIG);
    } catch (e) {
      const error = e as NodeJS.ErrnoException & { requireStack?: string[] };

      const path = error.requireStack?.[0]?.replaceAll("\\", "/");

      if (
        (error?.code === "MODULE_NOT_FOUND" &&
          path?.includes("bsm/dist/index.js")) ||
        // For when running tests or with ts-node
        (process.env.NODE_ENV !== "production" &&
          path?.includes("bsm/src/ConfigLoader.ts"))
      ) {
        if (noBail) return undefined;

        console.error(
          `\x1b[31mCannot find config '${source}' to extend\x1b[0m`,
        );
        process.exit(1);
      } else {
        console.error(e);

        if (Array.isArray(file)) file = file[0];
        console.error(`\x1b[31mError loading config '${file}'\x1b[0m`);
        process.exit(1);
      }
    }
  }

  static load(argv: minimist.ParsedArgs): TConfig {
    const possibleConfigFiles: string[] = [
      argv.config,
      process.env.BSM_CONFIG,
      "./package.scripts.js",
      "./package.scripts.json",
    ].filter((s): s is string => s !== undefined);

    for (const file of possibleConfigFiles) {
      const config = this.loadFile(file);
      if (!config) continue;

      process.env.BSM_CONFIG = file;
      this._config = config;
      return config;
    }

    console.error(
      `\x1b[31mCannot find config ${possibleConfigFiles
        .filter((s): s is string => s !== undefined)
        .map((s) => `'${s}'`)
        .join(" or ")}\x1b[0m`,
    );
    process.exit(1);
  }

  private static _config: TConfig | undefined;

  static get config(): TConfig {
    if (this._config) return this._config;
    throw new Error("Config not loaded");
  }
}
