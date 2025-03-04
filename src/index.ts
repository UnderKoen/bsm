#! /usr/bin/env node

import minimist from "minimist";

import { ConfigLoader } from "./ConfigLoader";
import { Cli } from "./Cli";
import { BsmError, BsmFunctionError } from "./BsmError";

const argv = minimist(process.argv.slice(2), {
  "--": true,
  boolean: ["interactive", "help", "version"],
  alias: {
    help: "h",
    version: "v",
    interactive: "i",
    force: "f",
  },
});

//TODO maybe not the cleanest way to do this
process.argv = argv["--"] ?? [];

export async function main() {
  const config = await ConfigLoader.load(argv);

  const cli = new Cli(config, argv);

  await cli.run();
}

if (process.env.NODE_ENV !== "test")
  main().catch((c: unknown) => {
    if (c instanceof BsmFunctionError) {
      console.error(c.func);
      console.error(`\x1b[31mError executing function '${c.script}'\x1b[0m`);
      process.exit(1);
    }

    if (c instanceof BsmError) {
      console.error(
        `\x1b[31mScript failed with code ${c.code}\x1b[0m \x1b[90m(${c.script})\x1b[0m`,
      );
      process.exit(c.code);
    }

    console.error(c);
    console.error(`\x1b[31mScript failed\x1b[0m`);
    process.exit(1);
  });
