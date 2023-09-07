import { TError, TFunction, TScript, TScripts } from "./types";
import child_process from "node:child_process";
import { isCI } from "ci-info";

type Options = {
  excludeArgs?: true;
  ignoreNotFound?: true;
};

export async function runScript(
  context: TScript,
  script: string[],
  path: string[],
  options: Options,
): Promise<void> {
  if (typeof context === "function") {
    await executeFunction(context, script, path, options);
  } else if (typeof context === "string") {
    await executeString(context, script, path, options);
  } else if (Array.isArray(context)) {
    await executeArray(context, script, path, options);
  } else {
    await executeObject(context, script, path, options);
  }
}

function notFound(path: string[], options: Options): never | void {
  if (options.ignoreNotFound) return;
  console.error(`\x1b[31mScript '${path.join(".")}' not found\x1b[0m`);
  process.exit(127);
}

async function executeFunction(
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
    if (script.length > 0) notFound([...path, ...script], options);
    return;
  }

  await runScript(result, script, path, options);
}

async function executeString(
  context: string,
  script: string[],
  path: string[],
  options: Options,
): Promise<void> {
  if (script.length > 0) return notFound([...path, ...script], options);

  if (!options.excludeArgs && process.argv?.length) {
    context += " " + process.argv.join(" ");
  }

  console.log(`> ${context} \x1b[90m(${path.join(".")})\x1b[0m`);

  if (context === "") return;

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

async function executeArray(
  context: TScript[],
  script: string[],
  path: string[],
  options: Options,
): Promise<void> {
  if (script.length === 0 || script[0] === "*") {
    for (let i = 0; i < context.length; i++) {
      await runScript(context[i], script.slice(1), [...path, i.toString()], {
        ...options,
        ignoreNotFound: script[0] === "*" ? true : options.ignoreNotFound,
      });
    }
    return;
  } else {
    const sub = script[0];
    const element = context[parseInt(sub)];

    if (element === undefined) return notFound([...path, sub], options);

    await runScript(element, script.slice(1), [...path, sub], options);
  }
}

async function executeObject(
  context: TScripts,
  script: string[],
  path: string[],
  options: Options,
): Promise<void> {
  try {
    //TODO don't execute when command is not found
    await executeHook(context, "_pre", path, options);

    if (script.length === 0) {
      await runObject(context, path, options);
    } else if (script[0] === "*") {
      for (const key in context) {
        if (key.startsWith("_")) continue;
        if (Object.hasOwn(context, key)) {
          await runScript(context[key], script.slice(1), [...path, key], {
            ...options,
            ignoreNotFound: script[0] === "*" ? true : options.ignoreNotFound,
          });
        }
      }
    } else {
      const sub = script[0];
      if (Object.hasOwn(context, sub)) {
        await runScript(context[sub], script.slice(1), [...path, sub], options);
      } else {
        return notFound([...path, sub], options);
      }
    }

    await executeHook(context, "_post", path, options);
  } catch (e) {
    process.env.BSM_ERROR = (e as TError).code?.toString() ?? "1";

    await executeHook(context, "_onError", path, options);

    if (!(await executeHook(context, "_catch", path, options))) {
      throw e;
    }
  } finally {
    await executeHook(context, "_finally", path, options);
  }
}

async function executeHook(
  context: TScripts,
  hook: string,
  path: string[],
  options: Options,
): Promise<boolean> {
  if (!Object.hasOwn(context, hook)) return false;

  await runScript(context[hook], [], [...path, hook], {
    ...options,
    excludeArgs: true,
  });

  return true;
}

async function runObject(context: TScripts, path: string[], options: Options) {
  const platform = `_${process.platform}`;

  if (isCI && Object.hasOwn(context, "_ci")) {
    await runScript(context["_ci"], [], [...path, "_ci"], options);
  } else if (Object.hasOwn(context, platform)) {
    await runScript(context[platform], [], [...path, platform], options);
  } else if (Object.hasOwn(context, "_default")) {
    await runScript(context["_default"], [], [...path, "_default"], options);
  } else {
    notFound(path, options);
  }
}
