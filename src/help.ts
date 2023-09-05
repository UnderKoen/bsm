import { TConfig, TScript } from "./types";
import minimist from "minimist";

export function printHelp(
  config: TConfig,
  argv: minimist.ParsedArgs,
  args: unknown,
): void {
  const helps: string[] = [];
  if (typeof args === "boolean") {
    if (!args) return;
  } else if (typeof args === "string" || typeof args === "number") {
    helps.push(`${args}`);
  } else if (Array.isArray(args)) {
    helps.push(...(args as string[]));
  } else {
    return;
  }

  helps.push(...argv._);

  if (helps.length === 0) {
    //Printing all commands
    console.log(`\n\x1b[1mAvailable commands:\x1b[0m`);
    printCommands(config.scripts);
  } else {
    // TODO clean up this mess
    for (const help of helps) {
      console.log(`\n\x1b[1mAvailable commands: \x1b[90m${help}\x1b[0m`);
      const path = help.split(".");

      const todo: [TScript, string[], string[]][] = [
        [config.scripts, [], path],
      ];
      while (todo.length > 0) {
        const current = todo.shift();
        if (!current) continue;

        if (current[2].length === 0) {
          printCommands(current[0], current[1]);
        } else if (current[2][0] === "*") {
          if (typeof current[0] === "object") {
            if (Array.isArray(current[0])) {
              for (let i = 0; i < current[0].length; i++) {
                todo.push([current[0][i], [...current[1], i.toString()], []]);
              }
            } else {
              for (const key in current[0]) {
                if (Object.hasOwn(current[0], key)) {
                  todo.push([
                    current[0][key],
                    [...current[1], key],
                    current[2].slice(1),
                  ]);
                }
              }
            }
          }
        } else {
          const sub = current[2][0];

          if (typeof current[0] === "object") {
            if (Array.isArray(current[0])) {
              const i = parseInt(sub);
              todo.push([
                current[0][i],
                [...current[1], i.toString()],
                current[2].slice(1),
              ]);
            } else {
              todo.push([
                current[0][sub],
                [...current[1], sub],
                current[2].slice(1),
              ]);
            }
          }
        }
      }
    }
  }
  process.exit(0);
}

export function printCommands(
  script: TScript | undefined,
  path: string[] = [],
) {
  if (Array.isArray(script)) {
    script.forEach((s, i) => {
      printCommand(s, [...path, i.toString()]);
    });
  } else if (typeof script === "object") {
    for (const key in script) {
      if (Object.hasOwn(script, key)) {
        printCommand(script[key], [...path, key]);
      }
    }
  } else {
    printCommand(script, path);
  }
}

export function printCommand(scripts: TScript | undefined, path: string[]) {
  if (scripts === undefined) {
    console.error(`\x1b[31mScript '${path.join(".")}' not found\x1b[0m`);
    return;
  }

  const prefix = `\x1b[92m${path.join(".")}\x1b[90m - \x1b[0m`;
  let suffix: string;
  if (typeof scripts === "string") {
    suffix = scripts;
  } else if (typeof scripts === "function") {
    suffix = "\x1b[90m<function>\x1b[0m";
  } else if (Array.isArray(scripts)) {
    suffix = `\x1b[90m[${scripts.length}]\x1b[0m`;
  } else {
    suffix = `\x1b[90m{${Object.keys(scripts).join(", ")}}\x1b[0m`;
  }

  console.log(`${prefix}${suffix}`);
}
