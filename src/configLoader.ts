import { ExtendConfig, TConfig } from "./types";
import minimist from "minimist";
import { defu } from "defu";

type AdvanceConfig = (...args: unknown[]) => TConfig;

const DEFAULT_CONFIG: TConfig = {
  scripts: {},
  config: {
    allowFunction: false,
  },
};

function getSource(config: ExtendConfig): string {
  if (Array.isArray(config)) return config[0];
  return config;
}

function loadExtensions(config: TConfig): TConfig[] {
  if (!Object.hasOwn(config, "extends") || !config.extends) return [];

  return config.extends.map((c) => loadFile(c, false));
}

function loadFile(file: ExtendConfig, noBail: false): TConfig;
function loadFile(file: ExtendConfig | undefined): TConfig | undefined;
function loadFile(
  file: ExtendConfig | undefined,
  noBail = true,
): TConfig | undefined {
  if (!file) return undefined;
  let source = getSource(file);

  try {
    source = require.resolve(source, {
      paths: [process.cwd()],
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let config = require(source) as TConfig | AdvanceConfig;
    if (typeof config === "function") {
      config = config(...(Array.isArray(file) ? file.slice(1) : []));
    }

    const configs = loadExtensions(config);

    return defu(config, ...configs, DEFAULT_CONFIG);
  } catch (e) {
    // @ts-expect-error code is not defined in the node typings
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (e?.code === "MODULE_NOT_FOUND" && e.requireStack?.length === 1) {
      if (noBail) return undefined;

      console.error(`\x1b[31mCannot find config '${source}' to extend\x1b[0m`);
      process.exit(1);
    }
    console.error(e);

    if (Array.isArray(file)) file = file[0];
    console.error(`\x1b[31mError loading config '${file}'\x1b[0m`);
    process.exit(1);
  }
}

export function loadConfig(argv: minimist.ParsedArgs): TConfig {
  const possibleConfigFiles: string[] = [
    argv.config,
    process.env.BSM_CONFIG,
    "./package.scripts.js",
    "./package.scripts.json",
  ].filter((s): s is string => s !== undefined);

  for (const file of possibleConfigFiles) {
    const config = loadFile(file);
    if (!config) continue;

    process.env.BSM_CONFIG = file;
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
