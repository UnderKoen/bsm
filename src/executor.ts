import { TError, TFunction, TScript, TScripts } from "./types";
import child_process from "node:child_process";
import { isCI } from "ci-info";

type Options = {
  excludeArgs?: true;
  ignoreNotFound?: true;
};

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class Executor {
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
      Executor.notFound(path, options);
    }
  }

  static notFound(path: string[], options: Options): never | void {
    if (options.ignoreNotFound) return;
    console.error(`\x1b[31mScript '${path.join(".")}' not found\x1b[0m`);
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
    try {
      result = (await context.call(null, process.argv)) as TScript | undefined;
    } catch (e) {
      if (e instanceof Error) {
        // Remove BSM stack trace
        e.stack = e.stack?.split("    at executeFunction")[0];
      }

      throw {
        function: e,
        script: path.join("."),
      } as TError;
    }

    if (result == undefined) {
      if (script.length > 0) Executor.notFound([...path, ...script], options);
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
    if (script.length > 0)
      return Executor.notFound([...path, ...script], options);

    if (!options.excludeArgs && process.argv?.length) {
      context += " " + process.argv.join(" ");
    }

    console.log(`> ${context} \x1b[90m(${path.join(".")})\x1b[0m`);

    if (context === "") return;

    // Escape ~ for unix shells
    context = context.replace(/bsm ~/g, "bsm \\~");

    return await new Promise((resolve, reject) => {
      const s = child_process.spawn(context, [], {
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
      const element = context[parseInt(sub)];

      if (element === undefined)
        return Executor.notFound([...path, sub], options);

      await Executor.runScript(
        element,
        script.slice(1),
        [...path, sub],
        options,
      );
    }
  }

  static async executeObject(
    context: TScripts,
    script: string[],
    path: string[],
    options: Options,
  ): Promise<void> {
    try {
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
          return Executor.notFound([...path, sub], options);
        }
      }

      await Executor.executeHook(context, "_post", path, options);
    } catch (e) {
      process.env.BSM_ERROR = (e as TError).code?.toString() ?? "1";

      await Executor.executeHook(context, "_onError", path, options);

      if (!(await Executor.executeHook(context, "_catch", path, options))) {
        throw e;
      }
    } finally {
      await Executor.executeHook(context, "_finally", path, options);
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

  static async runObject(context: TScripts, path: string[], options: Options) {
    const platform = `_${process.platform}`;

    if (Executor._isCI && Object.hasOwn(context, "_ci")) {
      await Executor.runScript(context["_ci"], [], [...path, "_ci"], options);
    } else if (Object.hasOwn(context, platform)) {
      await Executor.runScript(
        context[platform],
        [],
        [...path, platform],
        options,
      );
    } else if (Object.hasOwn(context, "_default")) {
      await Executor.runScript(
        context["_default"],
        [],
        [...path, "_default"],
        options,
      );
    } else {
      Executor.notFound(path, options);
    }
  }
}

export { Executor };