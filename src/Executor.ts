import { TFunction, TScript, TScripts } from "./types";
import child_process from "node:child_process";
import { isCI } from "ci-info";
import { Help } from "./Help";
import path from "path";
import fs from "fs";
import { Interactive } from "./Interactive";
import { ConfigLoader } from "./ConfigLoader";
import { Idempotency } from "./Idempotency";
import { BsmError, BsmFunctionError } from "./BsmError";

export type Options = {
  excludeArgs?: true;
  ignoreNotFound?: true;
  env?: Record<string, string>;
};

class Executor {
  //We test this with bin.ts
  /* c8 ignore next 4 */
  static async run(script: string): Promise<void> {
    const config = ConfigLoader.config;
    await Executor.runScript(config.scripts, script.split("."), [], {});
  }

  static async runScript(
    context: TScript,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    if (typeof context === "function") {
      await Executor.executeFunction(context, script, path, options);
    } else if (typeof context === "string") {
      await Executor.executeString(context, script, path, options);
    } else if (typeof context === "object") {
      if (Array.isArray(context)) {
        await Executor.executeArray(context, script, path, options);
      } else {
        await Executor.executeObject(context, script, path, options);
      }
    } else {
      // TODO support for other types
      // TODO improve not found message
      await Executor.notFound(path, options);
    }
  }

  static async notFound(
    path: string[],
    options: Options,
    context?: TScripts | TScript[],
  ): Promise<void> {
    if (options.ignoreNotFound) return;

    if (context) {
      const sub = path[path.length - 1];
      const rest = path.slice(0, -1);

      if (rest.length === 0) {
        console.error(`\x1b[31mScript '${sub}' does not exist\x1b[0m`);
      } else {
        console.error(
          `\x1b[31mScript '${rest.join(
            ".",
          )}' does not have a '${sub}' script\x1b[0m`,
        );
      }

      /* c8 ignore next 9 */
      if (ConfigLoader.config.config?.defaultHelpBehavior === "interactive") {
        //Interactive currently cannot be tested
        const scripts = await Interactive.selectScript(ConfigLoader.config, {
          _: [path.join(".")],
        });

        //TODO: support for multiple scripts (currently Interactive only supports one)
        await this.run(scripts[0]);
        process.exit(0);
      } else {
        console.log();
        if (Object.hasOwn(context, "$description")) {
          Help.printCommand(context, rest);
          console.log();
        }

        console.log(`\x1b[1mTry one of the following:\x1b[0m`);

        Help.printCommands(context, rest, false);
      }
    } else {
      console.error(`\x1b[31mScript '${path.join(".")}' not found\x1b[0m`);
    }
    process.exit(127);
  }

  static async executeFunction(
    context: TFunction,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    console.log(
      `> \x1b[93mExecuting JavaScript function\x1b[0m \x1b[90m(${[...path].join(
        ".",
      )})\x1b[0m`,
    );

    let result: TScript | undefined;
    const oldEnv = process.env;
    try {
      process.env = {
        ...process.env,
        ...options.env,
      };

      result = (await context.call(null, process.argv)) as TScript | undefined;
    } catch (e) {
      if (e instanceof Error) {
        // Remove BSM stack trace
        e.stack = e.stack?.split("    at executeFunction")[0];
      }

      throw new BsmFunctionError(e as Error, path.join("."));
    } finally {
      process.env = oldEnv;
    }

    if (result == undefined) {
      //TODO improve not found message
      if (script.length > 0)
        await Executor.notFound([...path, ...script], options);
      return;
    }

    await Executor.runScript(result, script, path, {
      ...options,
      excludeArgs: true,
    });
  }

  static async executeString(
    context: string,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    //TODO improve not found message
    if (script.length > 0) {
      await Executor.notFound([...path, ...script], options);
      return;
    }

    if (!options.excludeArgs && process.argv.length) {
      context += " " + process.argv.join(" ");
    }

    console.log(`> ${context} \x1b[90m(${path.join(".")})\x1b[0m`);
    if (process.env.BSM_LOG_FILE) {
      fs.appendFileSync(
        process.env.BSM_LOG_FILE,
        `${new Date().toISOString()}\t${context}\t${path.join(".")}\t${process.cwd()}\n`,
      );
    }

    if (context === "") return;

    // Escape ~ for unix shells
    context = context.replace(/bsm ~/g, "bsm \\~");

    await new Promise<void>((resolve, reject) => {
      const s = child_process.spawn(context, [], {
        stdio: "inherit",
        shell: true,
        env: {
          ...process.env,
          ...options.env,
          BSM_PATH: path.slice(0, -1).join("."),
          BSM_SCRIPT: path.join("."),
        },
      });

      s.on("close", (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new BsmError(code, path.join(".")));
        }
      });
    });
  }

  static async executeArray(
    context: TScript[],
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    if (script.length === 0 || script[0] === "*") {
      for (let i = 0; i < context.length; i++) {
        await Executor.runScript(
          context[i],
          script.slice(1),
          [...path, i.toString()],
          {
            ...options,
            ignoreNotFound: script[0] === "*" ? true : options.ignoreNotFound,
          },
        );
      }
      return;
    } else {
      const sub = script[0];
      const element = context[parseInt(sub)] as TScript | undefined;

      if (element === undefined) {
        const alias = Executor.subscriptWithAlias(context, sub);
        if (alias) {
          await Executor.runScript(
            alias[1],
            script.slice(1),
            [...path, alias[0]],
            options,
          );
          return;
        } else {
          await Executor.notFound([...path, sub], options, context);
          return;
        }
      }

      await Executor.runScript(
        element,
        script.slice(1),
        [...path, sub],
        options,
      );
    }
  }

  static shouldRun(
    context: TScripts,
    script: string[],
    path: string[],
    options: Options,
  ): boolean {
    if (Idempotency.hasIdempotencyEnabled(context)) {
      const isSame = Idempotency.checkIdempotency(
        context,
        [...path, ...script],
        options,
      );
      if (isSame) {
        console.log(
          `\x1b[90mNot running ${[...path, ...script].join(".")} because the idempotency hash is the same\x1b[0m`,
        );
        return false;
      }
    }

    return true;
  }

  static async executeObject(
    context: TScripts,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    try {
      if (Object.hasOwn(context, "$env")) {
        options.env = {
          ...options.env,
          ...Executor.getEnv(context["$env"]),
        };
      }

      if (!Executor.shouldRun(context, script, path, options)) {
        return;
      }

      //TODO don't execute when command is not found
      await Executor.executeHook(context, "_pre", path, options);

      if (script.length === 0) {
        await Executor.runObject(context, path, options);
      } else if (script[0] === "*") {
        for (const key in context) {
          if (key.startsWith("_")) continue;
          if (key.startsWith("$")) continue;
          if (Object.hasOwn(context, key)) {
            await Executor.runScript(
              context[key],
              script.slice(1),
              [...path, key],
              {
                ...options,
                ignoreNotFound: true,
              },
            );
          }
        }
      } else {
        const sub = script[0];
        if (Object.hasOwn(context, sub)) {
          await Executor.runScript(
            context[sub],
            script.slice(1),
            [...path, sub],
            options,
          );
        } else {
          const alias = Executor.subscriptWithAlias(context, sub);
          if (alias) {
            await Executor.runScript(
              alias[1],
              script.slice(1),
              [...path, alias[0]],
              options,
            );
          } else {
            await Executor.notFound([...path, sub], options, context);
            return;
          }
        }
      }

      await Executor.executeHook(context, "_post", path, options);

      if (Idempotency.hasIdempotencyEnabled(context)) {
        Idempotency.saveIdempotency(context, [...path, ...script]);
      }
    } catch (e) {
      if (e instanceof BsmError) {
        process.env.BSM_ERROR = e.code.toString();
      } else {
        process.env.BSM_ERROR = "1";
      }

      await Executor.executeHook(context, "_onError", path, options);

      if (!(await Executor.executeHook(context, "_catch", path, options))) {
        throw e;
      }

      // If the catch is successful, we save the idempotency hash
      if (Idempotency.hasIdempotencyEnabled(context)) {
        Idempotency.saveIdempotency(context, [...path, ...script]);
      }
    } finally {
      await Executor.executeHook(context, "_finally", path, options);
    }
  }

  static subscriptWithAlias(
    context: TScripts | TScript[],
    alias: string,
  ): [string, TScript] | undefined {
    for (const entry of Object.entries(context)) {
      const script = entry[1];
      if (typeof script !== "object") continue;
      if (Array.isArray(script)) continue;

      if (Object.hasOwn(script, "$alias")) {
        const aliases = script["$alias"];

        if (typeof aliases === "string") {
          if (aliases === alias) {
            return entry;
          }
        } else if (Array.isArray(aliases)) {
          if (aliases.includes(alias)) {
            return entry;
          }
        }
      }
    }

    return undefined;
  }

  static getEnv(context: TScript): Record<string, string> {
    if (typeof context === "string") {
      if (context === "") {
        return {};
      } else if (context.startsWith("file:")) {
        // Maybe have an option for static file instead of cws
        const file = path.join(process.cwd(), context.slice(5));

        if (!fs.existsSync(file)) {
          console.error(
            `\x1b[31mFile '${file}' does not exist\x1b[0m\n` +
              "\x1b[1mRunning script without these environment variables\x1b[0m\n",
          );
          return {};
        }
        const content = fs.readFileSync(file, "utf-8").replaceAll("\r", "");

        // remove comments and blank lines
        const lines = content.split("\n").filter((line) => {
          return !line.startsWith("#") && line.trim() !== "";
        });

        const env: Record<string, string> = {};

        for (const line of lines) {
          const regex = /^([^=]+)=(['"])?(.+)\2$/g;
          const match = regex.exec(line);

          if (match) {
            let value = match[3];
            const quote = match[2];

            if (quote === '"') {
              value = value
                .replaceAll(/(?<=(?<!\\)(\\\\)*)\\n/g, "\n")
                .replaceAll(/(?<=(?<!\\)(\\\\)*)\\t/g, "\t")
                .replaceAll(/(?<=(?<!\\)(\\\\)*)\\r/g, "\r")
                .replaceAll(/(?<=(?<!\\)(\\\\)*)\\\\/g, "\\");
            }

            env[match[1]] = value;
          }
        }

        return env;
      } else {
        //TODO: support for other formats
        console.error(
          "\x1b[31mCurrently only 'file:' is supported for environment variables\x1b[0m\n",
        );

        return {};
      }
    } else if (typeof context === "object") {
      if (!Array.isArray(context)) {
        return context as Record<string, string>;
      } else {
        let env: Record<string, string> = {};
        for (const el of context) {
          env = {
            ...env,
            ...Executor.getEnv(el),
          };
        }
        return env;
      }
    } else {
      // Function
      const env = context.call(null, process.argv) as TScript | undefined;
      if (env === undefined) return {};

      return Executor.getEnv(env);
    }
  }

  static async executeHook(
    context: TScripts,
    hook: string,
    path: string[],
    options: Options,
  ): Promise<boolean> {
    if (!Object.hasOwn(context, hook)) return false;

    await Executor.runScript(context[hook], [], [...path, hook], {
      ...options,
      excludeArgs: true,
    });

    return true;
  }

  /**
   * Just exists for testing purposes
   */
  static get _isCI(): boolean {
    return isCI;
  }

  static get objectScripts(): string[] {
    const scriptNames = [
      `_${process.platform}`,
      `_${process.arch}`,
      "_default",
    ];
    if (Executor._isCI) {
      scriptNames.unshift("_ci");
    }

    return scriptNames;
  }

  static async runObject(context: TScripts, path: string[], options: Options) {
    for (const script of Executor.objectScripts) {
      if (Object.hasOwn(context, script)) {
        await Executor.runScript(
          context[script],
          [],
          [...path, script],
          options,
        );
        return;
      }
    }

    await Executor.notFound([...path, "_default"], options, context);
  }

  //TODO currently only used in interactive
  /* c8 ignore next 15 */
  static isExecutable(context: TScript): boolean {
    if (typeof context === "function") return true;
    if (typeof context === "string") return true;
    // Unknown type
    if (typeof context !== "object") return false;
    if (Array.isArray(context)) return true;

    for (const script of Executor.objectScripts) {
      if (Object.hasOwn(context, script)) {
        return true;
      }
    }

    return false;
  }
}

export { Executor };
