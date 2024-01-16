import { test, exec } from "uvu";
import * as assert from "uvu/assert";
import child_process from "node:child_process";
import fs from "fs";

test("bsm testing.*", async () => {
  let text = "";

  const code = await new Promise<number>((resolve, reject) => {
    const s = child_process.spawn("node ./dist/index testing.*", [], {
      shell: true,
      cwd: process.cwd(),
    });

    s.stdout.setEncoding("utf8");
    s.stdout.on("data", function (data) {
      text += data;
    });

    s.stderr.setEncoding("utf8");
    s.stderr.on("data", function (data) {
      text += data;
    });

    s.on("close", (code: number) => {
      resolve(code);
    });
  });

  assert.is(code, 0);

  // fs.writeFileSync("./test/bin.snapshot", text, "utf8");

  assert.is(text, fs.readFileSync("./test/bin.snapshot", "utf8"));
});

test.run();
