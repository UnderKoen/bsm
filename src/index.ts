#! /usr/bin/env node

const argv = require("minimist")(process.argv.slice(2), { "--": true });
const path = require("path");

interface TConfig {
  scripts: TScripts;
}

// a record can't be used here because it doesn't allow for circular references
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
interface TScripts {
  [key: string]: TScript;
}

type TScript = string | TScript[] | TScripts;

const config: TConfig = require(path.join(process.cwd(), "package.scripts.js"));
const child_process = require("node:child_process");

const scripts = config.scripts;

async function main() {
  for (const script of argv._) {
    if (script.startsWith("~") && process.env.BSM_PATH) {
      const prefix = process.env.BSM_PATH.split(".");
      const sub = getScript(scripts, prefix);

      if (sub) {
        await runScript(sub, script.split(".").splice(1), prefix);
        continue;
      }
    }

    await runScript(scripts, script.split("."));
  }
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
  includeArgs: boolean = true
): Promise<void> {
  try {
    //TODO don't execute when command is not found
    await executeIfExists(context, ["_pre"], path, false, true);

    const rest = script.slice(1);

    if (script.length === 0) {
      await executeScript(context, path, includeArgs);
    } else if (script[0] === "*") {
      await executeAll(context, rest, path);
    } else if (await executeIfExists(context, script, path)) {
      // already executed
    } else {
      //TODO improve error message
      console.error(
        `\x1b[31mScript '${[...path, ...script].join(".")}' not found\x1b[0m`
      );
      return process.exit(127);
    }

    await executeIfExists(context, ["_post"], path, false, true);
  } catch (e: any) {
    process.env.BSM_ERROR = e?.code?.toString();
    await executeIfExists(context, ["_onError"], path, false, true);
    if (!(await executeIfExists(context, ["_catch"], path, false))) {
      throw e;
    }
  } finally {
    await executeIfExists(context, ["_finally"], path, false, true);
  }
}

async function executeAll(context: TScript, rest: string[], path: string[]) {
  if (typeof context === "string") {
    await runScript(context, rest, path);
  } else if (Array.isArray(context)) {
    for (let i = 0; i < context.length; i++) {
      await runScript(context[i], rest, [...path, i.toString()]);
    }
  } else {
    for (const key in context) {
      if (key.startsWith("_")) continue;
      if (Object.hasOwn(context, key)) {
        await runScript(context[key], rest, [...path, key]);
      }
    }
  }
}

async function executeIfExists(
  script: TScript,
  name: string[],
  path: string[],
  includeArgs: boolean = true,
  preventLoop: boolean = false
): Promise<boolean> {
  if (preventLoop && process.env.BSM_SCRIPT === [...path, ...name].join("."))
    return false;
  const sub = name[0];

  if (typeof script !== "object") return false;
  if (!Object.hasOwn(script, sub)) return false;

  if (Array.isArray(script)) {
    const i = parseInt(sub);
    await runScript(script[i], name.slice(1), [...path, sub], includeArgs);
  } else {
    await runScript(script[sub], name.slice(1), [...path, sub], includeArgs);
  }

  return true;
}

async function executeScript(
  script: TScript,
  path: string[],
  includeArgs: boolean
): Promise<void> {
  switch (typeof script) {
    case "string":
      //TODO optimise for running bsm again
      await spawnScript(script, path, includeArgs);
      return;
    case "object":
      if (Array.isArray(script)) {
        for (let i = 0; i < script.length; i++) {
          await runScript(script[i], [], [...path, i.toString()]);
        }
      } else {
        if (await executeIfExists(script, [`_${process.platform}`], path)) {
          /* empty */
        } else if (await executeIfExists(script, ["_default"], path)) {
          /* empty */
        }
      }
      return;
  }
}

async function spawnScript(
  script: string,
  path: string[],
  includeArgs: boolean
): Promise<void> {
  if (includeArgs && argv["--"].length) {
    script += " " + argv["--"].join(" ");
  }

  return new Promise((resolve, reject) => {
    console.log(`> ${script} \x1b[90m(${path.join(".")})\x1b[0m`);

    if (script === "") return resolve();

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

main().catch((c) => {
  console.error(
    `\x1b[31mScript failed with code ${c.code}\x1b[0m \x1b[90m(${c.script})\x1b[0m`
  );
  process.exit(c.code);
});
