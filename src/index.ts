#! /usr/bin/env node

import minimist from "minimist";

import * as fs from "node:fs";
import path from "path";

import { TScript, TError } from "./types";
import { printHelp } from "./help";
import { loadConfig } from "./configLoader";
import { runScript } from "./executor";

const argv = minimist(process.argv.slice(2), { "--": true });
//TODO maybe not the cleanest way to do this
process.argv = argv["--"] ?? [];

const config = loadConfig(argv);

async function main() {
  printHelp(config, argv, argv.h);
  printHelp(config, argv, argv.help);
  printHelp(config, argv, argv._.length === 0);

  addToPath(process.env, await getNpmBin());

  for (const script of argv._) {
    if (script.startsWith("~") && process.env.BSM_PATH) {
      const prefix = process.env.BSM_PATH.split(".");
      const sub = getScript(config.scripts, prefix);

      if (sub) {
        await runScript(sub, script.split(".").splice(1), prefix, {});
        continue;
      }
    }

    await runScript(config.scripts, script.split("."), [], {});
  }
}

function addToPath(env: NodeJS.ProcessEnv, path: string | null): void {
  if (!path) return;
  if (process.platform === "win32") {
    if (!process.env.Path || process.env.Path.includes(path)) return;
    env.Path = `${process.env.Path};${path}`;
  } else {
    if (!process.env.PATH || process.env.PATH.includes(path)) return;
    env.PATH = `${process.env.PATH}:${path}`;
  }
}

async function getNpmBin(): Promise<string | null> {
  let cwd = process.cwd();

  while (
    await fs.promises
      .access(path.join(cwd, "node_modules/.bin"), fs.constants.X_OK)
      .then(
        () => false, // exists
        () => true, // doesn't exist
      )
  ) {
    const cwd2 = path.join(cwd, "../");
    if (cwd2 === cwd) return null;
    cwd = cwd2;
  }

  return path.join(cwd, "node_modules/.bin");
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

main().catch((c: TError) => {
  if (c.function) {
    console.error(c.function);
    console.error(`\x1b[31mError executing function '${c.script}'\x1b[0m`);
    process.exit(1);
  }

  if (c.code === undefined) {
    console.error(c);
    console.error(`\x1b[31mScript failed\x1b[0m`);
    process.exit(1);
  }

  console.error(
    `\x1b[31mScript failed with code ${c.code}\x1b[0m \x1b[90m(${c.script})\x1b[0m`,
  );
  process.exit(c.code);
});
