import { ExtendConfig, TConfig } from "./types.js";
import minimist from "minimist";
import { defu } from "defu";
import { Logger } from "./Logger.js";
import * as mlly from "mlly";

type AdvanceConfig = (...args: unknown[]) => TConfig | Promise<TConfig>;

export const DEFAULT_CONFIG: Readonly<TConfig> = Object.freeze({
  scripts: {},
  config: {
    defaultHelpBehavior: "help",
    caseInsensitive: false,
    idempotency: {
      location: "./node_modules/.cache/bsm/idempotency",
      useFileContent: false,
    },
  },
} as TConfig);

export class ConfigLoader {
  static getSource(config: ExtendConfig): string {
    if (Array.isArray(config)) return config[0];
    return config;
  }

  static async loadExtensions(config: TConfig): Promise<TConfig[]> {
    if (!Object.hasOwn(config, "extends") || !config.extends) return [];

    return (
      await Promise.all([...config.extends].map((c) => this.loadFile(c, false)))
    ).filter((c): c is TConfig => c !== undefined);
  }

  static interopDefault(mod: unknown): unknown {
    if (typeof mod !== "object" || mod === null) return mod;
    if ("default" in mod) return mod.default;
    return mod;
  }

  static async loadFile(
    file: ExtendConfig | undefined,
    noBail = true,
  ): Promise<TConfig | undefined> {
    if (!file) return undefined;
    let source = this.getSource(file);

    try {
      // Fix resolving parents configs, https://github.com/unjs/mlly/pull/307
      source = await mlly.resolve(source, {
        url: process.cwd() + "/",
      });
    } catch {
      if (noBail) return undefined;

      Logger.error(`\x1b[31mCannot find config '${source}' to extend\x1b[0m`);
      process.exit(1);
    }

    try {
      let config = this.interopDefault(await import(source)) as
        | TConfig
        | AdvanceConfig;

      if (typeof config === "function") {
        config = await config(...(Array.isArray(file) ? file.slice(1) : []));
      }

      const configs = await this.loadExtensions(config);

      return defu(config, ...configs, DEFAULT_CONFIG);
    } catch (e) {
      Logger.error(e);

      if (Array.isArray(file)) file = file[0];
      Logger.error(`\x1b[31mError loading config '${file}'\x1b[0m`);
      process.exit(1);
    }
  }

  static async load(argv: minimist.ParsedArgs): Promise<TConfig> {
    const possibleConfigFiles: string[] = [
      argv.config,
      process.env.BSM_CONFIG,
      "./package.scripts.js",
      "./package.scripts.cjs",
      "./package.scripts.mjs",
      "./package.scripts.json",
    ].filter((s): s is string => s !== undefined);

    for (const file of possibleConfigFiles) {
      const config = await this.loadFile(file);
      if (!config) continue;

      process.env.BSM_CONFIG = file;
      this._config = config;
      return config;
    }

    Logger.error(
      `\x1b[31mCannot find config ${possibleConfigFiles
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
