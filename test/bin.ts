import { test } from "uvu";
import * as assert from "uvu/assert";
import child_process from "node:child_process";
import fs from "fs";

const commands = [
  "testing.default",
  // "testing.os", //Skip on CI
  "testing.args -- WOWOWOW",
  "testing.array",
  "testing.hooks",
  "testing.relative",
  "testing.error.onError",
  "testing.error.catch",
  "testing.error.finally",
  "testing.error.all",
  "testing.functions",
  "testing.env",
  "testing.env.overrides",
  "testing.env.file",
  "testing.debug",
];

for (const command of commands) {
  test(`bsm ${command}`, async () => {
    let text = "";

    const code = await new Promise<number>((resolve) => {
      const s = child_process.spawn(
        `node ./dist/index --config ./test ${command}`,
        [],
        {
          shell: true,
          cwd: process.cwd(),
        },
      );

      s.stdout.setEncoding("utf8");
      s.stdout.on("data", function (data) {
        text += data;
      });

      s.stderr.setEncoding("utf8");
      s.stderr.on("data", function (data) {
        text += data;
      });

      s.on("close", resolve);
    });

    const snapshot = `exitcode: ${code}\n\n${text}`;

    if (!fs.existsSync(`./test/snapshots/${command}.snapshot`)) {
      fs.writeFileSync(
        `./test/snapshots/${command}.snapshot`,
        snapshot,
        "utf8",
      );
    }

    assert.snapshot(
      snapshot,
      fs.readFileSync(`./test/snapshots/${command}.snapshot`, "utf8"),
    );
  });
}

test.run();
