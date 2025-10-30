#! /usr/bin/env node

import minimist from "minimist";

import { Cli } from "./Cli.js";
import { BsmError, BsmFunctionError } from "./BsmError.js";
import { Logger } from "./Logger.js";

const argv = minimist(process.argv.slice(2), {
  "--": true,
  boolean: ["interactive", "help", "version", "silent"],
  alias: {
    help: "h",
    version: "v",
    interactive: "i",
    force: "f",
    silent: "s",
  },
});

//TODO maybe not the cleanest way to do this
process.argv = argv["--"] ?? [];

export async function main() {
  const cli = new Cli(argv);

  await cli.run();
}

if (process.env.NODE_ENV !== "test")
  main().catch((c: unknown) => {
    if (c instanceof BsmFunctionError) {
      Logger.error(c.func);
      Logger.error(`\x1b[31mError executing function '${c.script}'\x1b[0m`);
      process.exit(1);
    }

    if (c instanceof BsmError) {
      Logger.error(
        `\x1b[31mScript failed with code ${c.code}\x1b[0m \x1b[90m(${c.script})\x1b[0m`,
      );
      process.exit(c.code);
    }

    Logger.error(c);
    Logger.error(`\x1b[31mScript failed\x1b[0m`);
    process.exit(1);
  });
