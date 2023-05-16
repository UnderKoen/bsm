#! /usr/bin/env node

const argv = require("minimist")(process.argv.slice(2), {"--": true});
const path = require("path");

interface TConfig {
  scripts: TScripts;
}

type TScripts = {
  [key: string]: TScript;
};

type TScript = string | TScript[] | TScripts;

const config: TConfig = require(path.join(process.cwd(), "package.scripts.js"));
const child_process = require("node:child_process");

const scripts = config.scripts;

async function runScript(
  context: TScript,
  script: string,
  path: string[] = []
): Promise<void> {
  if (script === "") {
    //TODO remove call here, or should call run script inside execute script
    await executeScript(context, path);
    return;
  } else if (typeof context === "object") {
    const sub = script.split(".", 2)[0];
    const rest = script.substring(sub.length + 1);

    if (sub === "*") {
      if (Array.isArray(context)) {
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
      return;
    }

    if (Array.isArray(context)) {
      const i = parseInt(sub);
      if (!isNaN(i) && context[i])
        return await runScript(context[i], rest, [...path, sub]);
    } else if (Object.hasOwn(context, sub)) {
      return await runScript(context[sub], rest, [...path, sub]);
    }
  }

  //TODO improve error message
  console.error(
    `\x1b[31mScript '${path.join(".")}.${script}' not found\x1b[0m`
  );
}

async function executeScript(script: TScript, path: string[]): Promise<void> {
  switch (typeof script) {
    case "string":
      //TODO optimise for running bsm again
      await spawnScript(script, path);
      return;
    case "object":
      if (Array.isArray(script)) {
        for (let i = 0; i < script.length; i++) {
          await executeScript(script[i], [...path, i.toString()]);
        }
      } else {
        const executeIfExists = async (name: string, addToPath: boolean = true): Promise<boolean> => {
          if (Object.hasOwn(script, name)) {
            await executeScript(script[name], addToPath ? [...path, name] : path);
            return true;
          }
          return false;
        }

        await executeIfExists("_pre");

        if (await executeIfExists(`_${process.platform}`)) { /* empty */
        } else if (await executeIfExists("_default", false)) { /* empty */
        }

        await executeIfExists("_post");
      }
      return;
  }
}

async function spawnScript(
  script: string,
  path: string[],
  includeArgs: boolean = true
): Promise<void> {
  if (includeArgs) {
    script += " " + argv["--"].join(" ");
  }

  return new Promise((resolve, reject) => {
    console.log(`> ${script} \x1b[90m(${path.join(".")})\x1b[0m`);
    const s = child_process.spawn(script, [], {stdio: "inherit", shell: true});

    s.on("close", (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        console.error(`\x1b[31mScript failed with code ${code}\x1b[0m \x1b[90m(${path.join(".")})\x1b[0m`)
        reject(code);
      }
    });
  });
}

async function main() {
  for (const script of argv._) {
    await runScript(scripts, script);
  }
}

main().catch(() => {
  //TODO return correct code
  process.exit(1);
});
