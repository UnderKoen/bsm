#! /usr/bin/env node

import minimist from "minimist";

import path from "path";

import { TScript, TError, TScripts } from "./types";
import { Help } from "./Help";
import { ConfigLoader } from "./ConfigLoader";
import { Executor } from "./Executor";
import { Interactive } from "./Interactive";

export const argv = minimist(process.argv.slice(2), {
  "--": true,
  boolean: ["interactive", "help", "version"],
  alias: {
    help: "h",
    version: "v",
    interactive: "i",
  },
});

//TODO maybe not the cleanest way to do this
process.argv = argv["--"] ?? [];

const config = ConfigLoader.load(argv);

function values(t: TScripts | TScript[]): TScript[] {
  if (Array.isArray(t)) return t;
  return Object.entries(t)
    .filter(([k]) => !k.startsWith("$"))
    .map(([, v]) => v);
}

export async function main() {
  if (argv["debug"]) {
    switch (argv["debug"]) {
      case "extends": {
        const ext = config.extends;
        if (ext) {
          for (const el of ext) {
            if (typeof el === "string") {
              console.log(el);
            } else {
              console.log(el[0]);
            }
          }
        }

        return process.exit(0);
      }

      case "scripts": {
        const scripts = [...values(config.scripts)];
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

        console.log(all.join("\n"));
        return process.exit(0);
      }
    }
  }

  if (argv["version"]) Help.printVersion();
  if (argv["help"]) Help.printHelp(config, argv);
  if (argv["interactive"]) {
    argv._ = await Interactive.selectScript(config, argv);
  }

  await handleNoArgs();

  addToPath(process.env, getNpmBin());

  for (let script of argv._) {
    // On Windows, you can't escape the tilde, so we have to do it for the user
    script = script.replace(/^\\~/g, "~");

    // TODO: move this to Executor
    if (script.startsWith("~") && process.env.BSM_PATH) {
      const prefix = process.env.BSM_PATH.split(".");
      const sub = getScript(config.scripts, prefix);

      if (sub) {
        await Executor.runScript(sub, script.split(".").splice(1), prefix, {});
        continue;
      }
    }

    await Executor.run(script);
  }
}

async function handleNoArgs() {
  if (argv._.length > 0) return;

  const event = process.env.npm_lifecycle_event;
  if (event && event !== "npx") {
    argv._ = [event.replaceAll(":", ".")];
    return;
  }

  const behavior =
    config.config?.defaultNoArgsBehavior ??
    config.config?.defaultHelpBehavior ??
    "help";

  if (behavior === "interactive") {
    argv._ = await Interactive.selectScript(config, argv);
  } else {
    Help.printHelp(config, argv);
  }
}

function addToPath(env: NodeJS.ProcessEnv, path: string[]): void {
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

  const sub = name[0];

  if (typeof scripts !== "object") return undefined;
  if (!Object.hasOwn(scripts, sub)) return undefined;

  if (Array.isArray(scripts)) {
    const i = parseInt(sub);
    return getScript(scripts[i], name.slice(1));
  } else {
    return getScript(scripts[sub], name.slice(1));
  }
}

if (process.env.NODE_ENV !== "test")
  main().catch((c: TError) => {
    if (c.function) {
      console.error(c.function);
      console.error(`\x1b[31mError executing function '${c.script}'\x1b[0m`);
      process.exit(1);
    }

    if (c.code == null) {
      console.error(c);
      console.error(`\x1b[31mScript failed\x1b[0m`);
      process.exit(1);
    }

    console.error(
      `\x1b[31mScript failed with code ${c.code}\x1b[0m \x1b[90m(${c.script})\x1b[0m`,
    );
    process.exit(c.code);
  });
