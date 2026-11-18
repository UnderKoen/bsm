import { TFunction, TScript, TScripts } from "./types.js";
import child_process from "node:child_process";
import { isCI } from "ci-info";
import { Help } from "./Help.js";
import path from "path";
import fs from "fs";
import { Interactive } from "./Interactive.js";
import { ConfigLoader } from "./ConfigLoader.js";
import { Idempotency } from "./Idempotency.js";
import { BsmError, BsmFunctionError } from "./BsmError.js";
import { Logger } from "./Logger.js";
import { Events, ScriptKind } from "./Events.js";

export type Options = {
  excludeArgs?: true;
  ignoreNotFound?: true;
  env?: Record<string, string>;
  /** Id of the run event node the next script runs under */
  eventId?: string;
  /** Set by executeHook so the event node is marked as a hook */
  hook?: string;
  /** Set by executeFunction so the event node is marked as returned by a function */
  returned?: true;
};

function scriptKind(context: TScript): ScriptKind {
  if (typeof context === "function") return "function";
  if (typeof context === "string") return "string";
  if (Array.isArray(context)) return "array";
  return "object";
}

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
    // Marks only apply to this script, not to the scripts it runs
    const marks = { hook: options.hook, returned: options.returned };
    delete options.hook;
    delete options.returned;

    // The root of the scripts tree is not a script of its own
    const id =
      path.length > 0
        ? Events.start(
            options.eventId,
            path.join("."),
            scriptKind(context),
            marks,
          )
        : undefined;
    if (id === undefined) {
      await Executor.dispatch(context, script, path, options);
      return;
    }

    // Options objects are shared with the caller, so restore the parent id afterwards
    const parent = options.eventId;
    options.eventId = id;
    try {
      await Executor.dispatch(context, script, path, options);
      Events.end(id, 0);
    } catch (e) {
      Events.fail(id, e);
      throw e;
    } finally {
      if (parent === undefined) delete options.eventId;
      else options.eventId = parent;
    }
  }

  static async dispatch(
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

      Logger.fail(
        rest.length === 0
          ? `Script '${sub}' does not exist`
          : `Script '${rest.join(".")}' does not have a '${sub}' script`,
        { id: options.eventId },
      );

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
        Logger.log();
        if (Object.hasOwn(context, "$description")) {
          Help.printCommand(context, rest);
          Logger.log();
        }

        Logger.log(`\x1b[1mTry one of the following:\x1b[0m`);

        Help.printCommands(context, rest, false);
      }
    } else {
      Logger.fail(`Script '${path.join(".")}' not found`, {
        id: options.eventId,
      });
    }
    process.exit(127);
  }

  static async executeFunction(
    context: TFunction,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    Logger.log(
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
        ...Events.childEnv(options.eventId),
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
      returned: true,
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

    Logger.log(`> ${context} \x1b[90m(${path.join(".")})\x1b[0m`);
    if (process.env.BSM_LOG_FILE) {
      fs.appendFileSync(
        process.env.BSM_LOG_FILE,
        `${new Date().toISOString()}\t${context}\t${path.join(".")}\t${process.cwd()}\n`,
      );
    }

    if (context === "") return;

    Events.spawn(options.eventId, context);

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
          ...Events.childEnv(options.eventId),
        },
      });

      s.on("close", (code: number | null, signal?: NodeJS.Signals | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(BsmError.fromExit(code, signal ?? null, path.join(".")));
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
      await Executor.runInOrder(
        context.map((c, i) => [i.toString(), c]),
        script.slice(1),
        path,
        options,
        script[0] === "*" ? true : options.ignoreNotFound,
      );
    } else {
      const sub = script[0];
      const subscript = Executor.subscript(context, sub);

      if (subscript) {
        await Executor.runScript(
          subscript[1],
          script.slice(1),
          [...path, subscript[0]],
          options,
        );
      } else {
        await Executor.notFound([...path, sub], options, context);
        return;
      }
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
        Events.skip(options.eventId, "idempotency hash is the same");
        Logger.log(
          `\x1b[90mNot running ${[...path, ...script].join(".")} because the idempotency hash is the same\x1b[0m`,
        );
        return false;
      }
    }

    return true;
  }

  static getObjectRunnerScriptName(context: TScripts): string | undefined {
    for (const script of Executor.objectScripts) {
      if (Object.hasOwn(context, script)) {
        return script;
      }
    }
    return undefined;
  }

  static async executeObject(
    context: TScripts,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    let postStarted = false;
    try {
      if (Object.hasOwn(context, "$env")) {
        options.env = {
          ...options.env,
          ...Executor.getEnv(context["$env"]),
        };
      }

      if (script.length === 0) {
        const scriptName = Executor.getObjectRunnerScriptName(context);

        if (scriptName) {
          script = [scriptName];
        } else {
          await Executor.notFound([...path, "_default"], options, context);
          return;
        }
      }

      if (!Executor.shouldRun(context, script, path, options)) {
        return;
      }

      //TODO don't execute when command is not found
      await Executor.executeHook(context, "_pre", script, path, options);

      if (script[0] === "*") {
        await Executor.runInOrder(
          Object.entries(context).filter(
            ([key]) => !key.startsWith("_") && !key.startsWith("$"),
          ),
          script.slice(1),
          path,
          options,
          true,
        );
      } else {
        const sub = script[0];
        const subscript = Executor.subscript(context, sub);

        if (subscript) {
          await Executor.runScript(
            subscript[1],
            script.slice(1),
            [...path, subscript[0]],
            options,
          );
        } else {
          await Executor.notFound([...path, sub], options, context);
          return;
        }
      }

      postStarted = true;
      await Executor.executeHook(context, "_post", script, path, options);

      if (Idempotency.hasIdempotencyEnabled(context)) {
        Idempotency.saveIdempotency(context, [...path, ...script]);
      }
    } catch (e) {
      // _post only runs after success
      const post = postStarted
        ? undefined
        : Executor.findHook(context, "_post", script);
      if (post) {
        Events.notRun(
          options.eventId,
          [
            {
              script: [...path, post].join("."),
              kind: scriptKind(context[post]),
              marks: { hook: "_post" },
            },
          ],
          e,
        );
      }

      if (e instanceof BsmError) {
        process.env.BSM_ERROR = e.code.toString();
      } else {
        process.env.BSM_ERROR = "1";
      }

      await Executor.executeHook(context, "_onError", script, path, options);

      if (
        !(await Executor.executeHook(context, "_catch", script, path, options))
      ) {
        throw e;
      }

      // If the catch is successful, we save the idempotency hash
      if (Idempotency.hasIdempotencyEnabled(context)) {
        Idempotency.saveIdempotency(context, [...path, ...script]);
      }
    } finally {
      await Executor.executeHook(context, "_finally", script, path, options);
    }
  }

  static subscript(
    context: TScripts | TScript[],
    script: string,
    checkAlias = true,
  ): [string, TScript] | undefined {
    if (typeof context !== "object") return undefined;

    if (!Object.hasOwn(context, script)) {
      script =
        (function findAlternative(): string | undefined {
          if (ConfigLoader.config.config?.caseInsensitive) {
            const otherCase = Object.keys(context).find(
              (k) => k.toLowerCase() === script.toLowerCase(),
            );
            if (otherCase) return otherCase;
          }

          if (checkAlias) {
            const alias = Executor.resolveAlias(context, script);
            if (alias) return alias;
          }

          return undefined;
        })() ?? script;
    }

    if (!Object.hasOwn(context, script)) return undefined;

    if (Array.isArray(context)) {
      const i = parseInt(script);
      return [script, context[i]];
    } else {
      return [script, context[script]];
    }
  }

  static resolveAlias(
    context: TScripts | TScript[],
    alias: string,
  ): string | undefined {
    for (const [key, script] of Object.entries(context)) {
      if (typeof script !== "object") continue;
      if (Array.isArray(script)) continue;

      if (!Object.hasOwn(script, "$alias")) continue;
      const aliases = Executor.getAliases(script["$alias"]);

      if (
        aliases.includes(alias) ||
        (ConfigLoader.config.config?.caseInsensitive &&
          aliases.map((s) => s.toLowerCase()).includes(alias.toLowerCase()))
      ) {
        return key;
      }
    }

    return undefined;
  }

  static getAliases(this: void, alias: TScript | undefined): string[] {
    if (typeof alias === "string") {
      return [alias];
    } else if (Array.isArray(alias)) {
      return alias.flatMap(Executor.getAliases);
    } else {
      Logger.error(
        `\x1b[31mAlias with type ${typeof alias} is not supported\x1b[0m`,
      );
      return [];
    }
  }

  static getEnv(context: TScript): Record<string, string> {
    if (typeof context === "string") {
      if (context === "") {
        return {};
      } else if (context.startsWith("file:")) {
        // Maybe have an option for static file instead of cws
        const file = path.join(process.cwd(), context.slice(5));

        if (!fs.existsSync(file)) {
          if (!ConfigLoader.config.config?.silentMissingEnvFiles)
            Logger.error(
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
        Logger.error(
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

  static getHookName(hook: string, script: string[]): string[] {
    if (script.length === 0) return [hook];

    return [`${hook}_${script[0]}`, hook];
  }

  static async executeHook(
    context: TScripts,
    hook: string,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<boolean> {
    const hookName = Executor.findHook(context, hook, script);
    if (hookName === undefined) return false;

    await Executor.runScript(context[hookName], [], [...path, hookName], {
      ...options,
      excludeArgs: true,
      hook,
    });

    return true;
  }

  /**
   * The hook that runs for `script`: the specific one (`_pre_test`) or the general one.
   */
  static findHook(
    context: TScripts,
    hook: string,
    script: string[],
  ): string | undefined {
    return Executor.getHookName(hook, script).find((name) =>
      Object.hasOwn(context, name),
    );
  }

  /**
   * Runs scripts one after the other. When one fails, the ones after it are
   * recorded as not run before the error goes up.
   */
  static async runInOrder(
    scripts: [string, TScript][],
    script: string[],
    path: string[],
    options: Options,
    ignoreNotFound: true | undefined,
  ): Promise<void> {
    for (let i = 0; i < scripts.length; i++) {
      const [key, context] = scripts[i];
      try {
        await Executor.runScript(context, script, [...path, key], {
          ...options,
          ignoreNotFound,
        });
      } catch (e) {
        Events.notRun(
          options.eventId,
          scripts.slice(i + 1).map(([key, context]) => ({
            script: [...path, key].join("."),
            kind: scriptKind(context),
          })),
          e,
        );
        throw e;
      }
    }
  }

  /**
   * Just exists for testing purposes
   */
  static get _isCI(): boolean {
    return isCI;
  }

  static get objectScripts(): string[] {
    const [major, minor, patch] = process.versions.node.split(".");

    const scriptNames = [
      `_${process.platform}`,
      `_${process.arch}`,
      `_node${major}_${minor}_${patch}`,
      `_node${major}_${minor}`,
      `_node${major}`,
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
