import { TConfig, TScript, TScripts } from "./types";
import { Interactive } from "./Interactive";
import { Help } from "./Help";
import { ParsedArgs } from "minimist";
import { Executor } from "./Executor";
import path from "path";
import { Logger } from "./Logger";

function values(t: TScripts | TScript[]): TScript[] {
  if (Array.isArray(t)) return t;
  return Object.entries(t)
    .filter(([k]) => !k.startsWith("$"))
    .map(([, v]) => v);
}

function addToPath(env: NodeJS.ProcessEnv, path?: string[]): void {
  if (!path) return;
  const sep = process.platform === "win32" ? ";" : ":";
  const bin = path.join(sep);

  if (!process.env.Path || process.env.Path.includes(bin)) return;
  env.Path = `${process.env.Path}${sep}${bin}`;
}

function getNpmBin(): string[] {
  const paths: string[] = [];
  let cwd = process.cwd();

  do {
    paths.push(path.join(cwd, "node_modules/.bin"));
  } while (cwd !== (cwd = path.join(cwd, "../")));

  return paths;
}

function getScript(scripts: TScript, name: string[]): TScript | undefined {
  if (name.length === 0) return scripts;
  if (typeof scripts !== "object") return undefined;

  const sub = name[0];
  const script = Executor.subscript(scripts, sub, false);
  if (!script) return undefined;

  return getScript(script[1], name.slice(1));
}

export class Cli {
  constructor(
    public readonly config: TConfig,
    public readonly argv: ParsedArgs,
  ) {}

  async run() {
    if (this.argv["silent"]) {
      Logger.silence();
    }

    this.handleDebug();

    if (this.argv["version"]) Help.printVersion();
    if (this.argv["help"]) Help.printHelp(this.config, this.argv);
    if (this.argv["interactive"]) {
      this.argv._ = await Interactive.selectScript(this.config, this.argv);
    }

    if (this.argv["force"]) {
      process.env.BSM_DISABLE_IDEMPOTENCY = "true";
    }

    await this.handleNoArgs();

    addToPath(process.env, getNpmBin());

    for (let script of this.argv._) {
      // On Windows, you can't escape the tilde, so we have to do it for the user
      script = script.replace(/^\\~/g, "~");

      // TODO: move this to Executor
      if (script.startsWith("~") && process.env.BSM_PATH) {
        const prefix = process.env.BSM_PATH.split(".");
        const sub = getScript(this.config.scripts, prefix);

        if (sub) {
          await Executor.runScript(
            sub,
            script.split(".").splice(1),
            prefix,
            {},
          );
          continue;
        }
      }

      await Executor.run(script);
    }
  }

  handleDebug(): void | never {
    if (this.argv["debug"]) {
      switch (this.argv["debug"]) {
        case "extends": {
          const ext = this.config.extends;
          if (ext) {
            for (const el of ext) {
              if (typeof el === "string") {
                Logger.log(el);
              } else {
                Logger.log(el[0]);
              }
            }
          }

          return process.exit(0);
        }

        case "scripts": {
          const scripts = [...values(this.config.scripts)];
          const all: string[] = [];
          while (scripts.length > 0) {
            const script = scripts.shift();
            if (!script) continue;

            if (typeof script === "string") {
              all.push(script);
            } else if (typeof script === "object") {
              scripts.push(...values(script));
            }
          }

          Logger.log(all.join("\n"));
          return process.exit(0);
        }
      }
    }
  }

  async handleNoArgs() {
    if (this.argv._.length > 0) return;

    const event = process.env.npm_lifecycle_event;
    if (event && event !== "npx") {
      this.argv._ = [event.replaceAll(":", ".")];
      return;
    }

    const behavior =
      this.config.config?.defaultNoArgsBehavior ??
      this.config.config?.defaultHelpBehavior ??
      "help";

    if (behavior === "interactive") {
      this.argv._ = await Interactive.selectScript(this.config, this.argv);
    } else {
      Help.printHelp(this.config, this.argv);
    }
  }
}
