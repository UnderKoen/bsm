#! /usr/bin/env node

import minimist from "minimist";

import child_process from "node:child_process";
import * as fs from "node:fs";
import path from "path";

import { isCI } from "ci-info";
import { TScript, TError, TFunction } from "./types";
import { printHelp } from "./help";
import { loadConfig } from "./configLoader";

const argv = minimist(process.argv.slice(2), { "--": true });

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
        await runScript(sub, script.split(".").splice(1), prefix);
        continue;
      }
    }

    await runScript(config.scripts, script.split("."));
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

async function runScript(
  context: TScript,
  script: string[],
  path: string[] = [],
  includeArgs = true,
  ignoreNotFound = false,
): Promise<void> {
  try {
    if (typeof context === "function") {
      try {
        const result = await executeFunction(context, script, path);
        if (!result && script.length === 0) return;

        context = result ?? {};
        includeArgs = true;
      } catch (e) {
        console.error(e);
        console.error(
          `\x1b[31mError executing function '${path.join(".")}'\x1b[0m`,
        );
        throw {
          code: 1,
          script: path.join("."),
        } as TError;
      }
    }

    //TODO don't execute when command is not found
    await executeIfExists(context, ["_pre"], path, false, true);

    const rest = script.slice(1);

    if (script.length === 0) {
      await executeScript(context, path, includeArgs, ignoreNotFound);
    } else if (script[0] === "*") {
      await executeAll(context, rest, path, includeArgs, true);
    } else if (
      await executeIfExists(
        context,
        script,
        path,
        includeArgs,
        false,
        ignoreNotFound,
      )
    ) {
      // already executed
    } else {
      //TODO improve error message
      console.error(
        `\x1b[31mScript '${[...path, ...script].join(".")}' not found\x1b[0m`,
      );
      return process.exit(127);
    }

    await executeIfExists(context, ["_post"], path, false, true);
  } catch (e) {
    process.env.BSM_ERROR = (e as TError).code.toString();
    await executeIfExists(context, ["_onError"], path, false, true);
    if (!(await executeIfExists(context, ["_catch"], path, false))) {
      throw e;
    }
  } finally {
    await executeIfExists(context, ["_finally"], path, false, true);
  }
}

async function executeAll(
  context: TScript,
  rest: string[],
  path: string[],
  includeArgs: boolean,
  ignoreNotFound: boolean,
) {
  if (typeof context === "string") {
    await runScript(context, rest, path);
  } else if (typeof context === "function") {
    //due to that function are already executed, we don't need to do anything
    process.exit(100);
  } else if (Array.isArray(context)) {
    for (let i = 0; i < context.length; i++) {
      await runScript(
        context[i],
        rest,
        [...path, i.toString()],
        includeArgs,
        ignoreNotFound,
      );
    }
  } else {
    for (const key in context) {
      if (key.startsWith("_")) continue;
      if (Object.hasOwn(context, key)) {
        await runScript(
          context[key],
          rest,
          [...path, key],
          includeArgs,
          ignoreNotFound,
        );
      }
    }
  }
}

async function executeFunction(
  fn: TFunction,
  rest: string[],
  path: string[],
): Promise<TScript | undefined> {
  console.log(
    `> \x1b[93mExecuting JavaScript function\x1b[0m \x1b[90m(${[...path].join(
      ".",
    )})\x1b[0m`,
  );

  return (await fn.call(null, argv["--"])) as TScript | undefined;
}

async function executeIfExists(
  script: TScript,
  name: string[],
  path: string[],
  includeArgs = true,
  preventLoop = false,
  ignoreNotFound = true,
): Promise<boolean> {
  if (preventLoop && process.env.BSM_SCRIPT === [...path, ...name].join("."))
    return false;
  const sub = name[0];

  if (typeof script !== "object") return false;
  if (!Object.hasOwn(script, sub)) return false;

  if (Array.isArray(script)) {
    const i = parseInt(sub);
    await runScript(
      script[i],
      name.slice(1),
      [...path, sub],
      includeArgs,
      ignoreNotFound,
    );
  } else {
    await runScript(
      script[sub],
      name.slice(1),
      [...path, sub],
      includeArgs,
      ignoreNotFound,
    );
  }

  return true;
}

async function executeScript(
  script: TScript,
  path: string[],
  includeArgs: boolean,
  ignoreNotFound: boolean,
): Promise<void> {
  switch (typeof script) {
    case "string":
      //TODO optimise for running bsm again
      await spawnScript(script, path, includeArgs);
      return;
    case "object":
      if (Array.isArray(script)) {
        for (let i = 0; i < script.length; i++) {
          await runScript(
            script[i],
            [],
            [...path, i.toString()],
            includeArgs,
            ignoreNotFound,
          );
        }
      } else {
        if (
          isCI &&
          (await executeIfExists(
            script,
            [`_ci`],
            path,
            includeArgs,
            false,
            ignoreNotFound,
          ))
        ) {
          /* empty */
        } else if (
          await executeIfExists(
            script,
            [`_${process.platform}`],
            path,
            includeArgs,
            false,
            ignoreNotFound,
          )
        ) {
          /* empty */
        } else if (
          await executeIfExists(
            script,
            ["_default"],
            path,
            includeArgs,
            false,
            ignoreNotFound,
          )
        ) {
          /* empty */
        } else if (!ignoreNotFound) {
          console.error(
            `\x1b[31mScript '${[...path].join(".")}' is not executable\x1b[0m`,
          );
          return process.exit(127);
        }
      }
      return;
  }
}

async function spawnScript(
  script: string,
  path: string[],
  includeArgs: boolean,
): Promise<void> {
  if (includeArgs && argv["--"]?.length) {
    script += " " + argv["--"].join(" ");
  }

  console.log(`> ${script} \x1b[90m(${path.join(".")})\x1b[0m`);

  if (script === "") return;

  return await new Promise((resolve, reject) => {
    const s = child_process.spawn(script, [], {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        BSM_PATH: path.slice(0, -1).join("."),
        BSM_SCRIPT: path.join("."),
      },
    });

    s.on("close", (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        reject({
          code: code,
          script: path.join("."),
        });
      }
    });
  });
}

main().catch((c: TError) => {
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
