import { test } from "uvu";
import * as assert from "uvu/assert";
import child_process from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";

const commands = [
  "testing.default",
  // "testing.os", //Skip on CI
  // "testing.arch", //Skip on CI
  "testing.args -- WOWOWOW",
  "testing.array",
  "testing.hooks",
  "testing.specificHooks",
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
  "testing.alias",
  "testing.idempotency",
  "testing.caseInsensitive",
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
      s.stdout.on("data", function (data: string) {
        text += data;
      });

      s.stderr.setEncoding("utf8");
      s.stderr.on("data", function (data: string) {
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

// Nested `bsm` calls must use this build, not a global install earlier in PATH
function localBsmEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  const key =
    Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[key] =
    `${path.resolve("node_modules/.bin")}${path.delimiter}${env[key] ?? ""}`;
  return env;
}

type RunEvent = Record<string, unknown>;
type LogRecord = { time: string; stream: string; log: string; bsm?: true };

async function runWithEvents(
  command: string,
  {
    config = "./test",
    cwd = process.cwd(),
  }: { config?: string | null; cwd?: string } = {},
): Promise<{
  code: number;
  text: string;
  files: RunEvent[][];
  names: string[];
  /** Log records by file, relative to `logs/` (`<id>.jsonl`, `process/root.jsonl`) */
  logs: Record<string, LogRecord[]>;
}> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bsm-events-"));

  try {
    let text = "";
    const code = await new Promise<number>((resolve) => {
      const s = child_process.spawn(
        `node "${path.resolve("dist/index.js")}" ${config === null ? "" : `--config ${config}`} ${command}`,
        [],
        {
          shell: true,
          cwd,
          env: { ...localBsmEnv({ BSM_EVENTS: dir }), BSM_CONFIG: undefined },
        },
      );
      s.stdout.setEncoding("utf8");
      s.stdout.on("data", (data: string) => (text += data));
      s.stderr.setEncoding("utf8");
      s.stderr.on("data", (data: string) => (text += data));
      s.on("close", resolve);
    });

    // In start order: `<id>-<folder>.jsonl` before `<id>-<folder>-2.jsonl`
    // (the counter is short, the folder hash always 8 characters)
    const order = (name: string) => {
      const match = /^(.*?)(?:-(\d{1,4}))?\.jsonl$/.exec(name);
      const n = match?.[2];
      return [match?.[1] ?? name, n === undefined ? 1 : Number(n)] as const;
    };
    const names = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort((a, b) => {
        const [baseA, nA] = order(a);
        const [baseB, nB] = order(b);
        return baseA === baseB ? nA - nB : baseA < baseB ? -1 : 1;
      });
    const files = names.map((f) =>
      fs
        .readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as RunEvent),
    );
    const logDir = path.join(dir, "logs");
    const logs = Object.fromEntries(
      (fs.existsSync(logDir)
        ? fs.readdirSync(logDir, { recursive: true, encoding: "utf8" })
        : []
      )
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => [
          f.replaceAll("\\", "/"),
          fs
            .readFileSync(path.join(logDir, f), "utf8")
            .split("\n")
            .filter(Boolean)
            .map((l) => JSON.parse(l) as LogRecord),
        ]),
    );
    return { code, text, files, names, logs };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Puts the event files in one readable order: each nested process directly
 * after the `spawn` that started it. Times and absolute paths are replaced so
 * the result is the same on every machine.
 */
function eventsSnapshot(files: RunEvent[][]): string {
  const parentOf = (file: RunEvent[]) =>
    file.find((e) => e.type === "start")?.parent;
  const lines: string[] = [];

  const emit = (file: RunEvent[]) => {
    for (const e of file) {
      lines.push(
        JSON.stringify({
          ...e,
          t: 0,
          ...(e.duration !== undefined && { duration: 0 }),
          ...(e.cwd !== undefined && {
            cwd: path.relative(process.cwd(), e.cwd as string) || ".",
          }),
        }),
      );
      if (e.type === "spawn") {
        files.filter((f) => parentOf(f) === e.id).forEach(emit);
      }
    }
  };
  files.filter((f) => parentOf(f) === undefined).forEach(emit);

  assert.is(
    lines.length,
    files.flat().length,
    "every event file is reachable from the root",
  );
  return lines.join("\n") + "\n";
}

// Every command again, now with BSM_EVENTS: the output must not change, and the
// events are snapshotted in test/snapshots/events/
function matchEventsSnapshot(name: string, files: RunEvent[][]): void {
  const snapshot = eventsSnapshot(files);
  const file = `./test/snapshots/events/${name}.jsonl`;
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, snapshot, "utf8");
  }
  assert.snapshot(snapshot, fs.readFileSync(file, "utf8"));
}

/** `echo` on Windows writes CRLF */
function lf(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

/**
 * Together the logs hold exactly what the terminal showed: every line once,
 * nothing extra. Every log belongs to a node of the run (or is a process log),
 * and nested `bsm` calls have no command output of their own.
 */
function checkLogs(
  files: RunEvent[][],
  logs: Record<string, LogRecord[]>,
  text: string,
): void {
  const lines = (s: string) =>
    lf(s)
      .split(/(?<=\n)/)
      .filter(Boolean)
      .sort();
  const logged = Object.values(logs)
    .flat()
    .map((r) => r.log);
  assert.equal(lines(logged.join("")), lines(text), "logs = terminal output");

  const events = files.flat();
  const ids = new Set(
    events.filter((e) => e.type === "start").map((e) => e.id),
  );
  for (const [file, records] of Object.entries(logs)) {
    if (file.startsWith("process/")) continue;
    const id = file.replace(/\.jsonl$/, "");
    assert.ok(ids.has(id), `${file} belongs to a node`);

    const spawn = events.find((e) => e.type === "spawn" && e.id === id);
    if (spawn && /^bsm(\s|$)/.test(spawn.cmd as string)) {
      assert.ok(
        records.every((r) => r.bsm === true),
        `${spawn.cmd as string} is nested: only bsm's own lines`,
      );
    }
  }
}

const eventCommands = [
  ...commands,
  // A function that throws (no output snapshot: it prints a stack trace with paths)
  "testing.functions.error.error",
];

for (const command of eventCommands) {
  test(`bsm ${command} with BSM_EVENTS`, async () => {
    const { code, text, files, logs } = await runWithEvents(command);
    checkLogs(files, logs, text);

    // Output is unchanged by events
    const output = `./test/snapshots/${command}.snapshot`;
    if (fs.existsSync(output)) {
      assert.snapshot(
        `exitcode: ${code}\n\n${text}`,
        fs.readFileSync(output, "utf8"),
      );
    }

    matchEventsSnapshot(command, files);
  });
}

test("BSM_EVENTS links nested bsm processes into one tree", async () => {
  const { files } = await runWithEvents("testing.relative");
  assert.is(files.length, 2);

  const events = files.flat();
  const starts = events.filter((e) => e.type === "start");
  const ids = new Set(starts.map((e) => e.id));
  assert.is(ids.size, starts.length, "ids are unique");

  // Exactly one root, every other node has a known parent
  const roots = starts.filter((e) => e.parent === undefined);
  assert.equal(
    roots.map((e) => e.script),
    ["testing"],
  );
  for (const e of starts) {
    if (e !== roots[0]) assert.ok(ids.has(e.parent), `${e.script} parent`);
  }

  // `bsm ~.test` starts again at testing.relative, in the inner process,
  // under the command that started it
  const outer = starts.find((e) => e.script === "testing.relative._default");
  const innerRoot = starts.find(
    (e) => e.script === "testing.relative" && e.parent === outer?.id,
  );
  assert.ok(innerRoot);
  const fileOf = (id: unknown) =>
    files.findIndex((f) => f.some((e) => e.type === "start" && e.id === id));
  assert.not.equal(fileOf(innerRoot.id), fileOf(outer?.id));

  // Every node ended
  for (const e of starts) {
    assert.ok(
      events.some((x) => x.type === "end" && x.id === e.id),
      `${e.script} ended`,
    );
  }
});

test("BSM_EVENTS reports a config that fails to load", async () => {
  const { code, files } = await runWithEvents("testing.default", {
    config: "./test/fixtures/error.js",
  });

  assert.is(code, 1);
  const events = files.flat();
  // No script ran, so the error hangs under nothing
  assert.equal(
    events.map((e) => [e.type, e.id]),
    [["error", undefined]],
  );
  assert.match(
    String(events[0].message),
    /^Error loading config '.\/test\/fixtures\/error.js': require is not defined/,
  );
});

test("BSM_EVENTS reports a missing config", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "bsm-no-config-"));
  try {
    const { code, files } = await runWithEvents("build", { config: null, cwd });

    assert.is(code, 1);
    assert.equal(files.flat(), [
      {
        v: 1,
        t: files.flat()[0].t,
        type: "error",
        message:
          "Cannot find config './package.scripts.js' or './package.scripts.cjs' or './package.scripts.mjs' or './package.scripts.json'",
      },
    ]);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("BSM_EVENTS names files after the node that started the process", async () => {
  const { files, names } = await runWithEvents("testing.idempotency");

  // `bsm ~.* && bsm ~.*`: two processes started by one node
  const spawn = files
    .flat()
    .find((e) => e.type === "spawn" && e.cmd === "bsm ~.* && bsm ~.*");
  assert.ok(spawn);
  // Same node, same folder: numbered in start order
  const nested = names.filter((n) => n !== "root.jsonl").sort();
  assert.is(names.length, 3);
  assert.match(
    nested[0],
    new RegExp(`^${String(spawn.id)}-[0-9a-f]{8}-2\\.jsonl$`),
  );
  assert.is(nested[0].replace("-2.jsonl", ".jsonl"), nested[1]);
  // And each file's first node points at the node it's named after
  for (const [i, name] of names.entries()) {
    const parent = files[i].find((e) => e.type === "start")?.parent;
    assert.is(
      name.replace(/(-[0-9a-f]{8})?(-\d{1,4})?\.jsonl$/, ""),
      parent === undefined ? "root" : parent,
    );
  }
});

// Scenarios from test/fixtures/events.mjs
const eventsFixture = "./test/fixtures/events.mjs";

const endOf = (events: RunEvent[], script: string) => {
  const start = events.find((e) => e.type === "start" && e.script === script);
  const end = events.find((e) => e.type === "end" && e.id === start?.id);
  return [end?.code, end?.signal];
};

test("BSM_EVENTS reports an error that is not a failing command once", async () => {
  const { code, files } = await runWithEvents("envError", {
    config: eventsFixture,
  });

  assert.is(code, 1);
  const events = files.flat();
  // On the node where it happened; the command never ran
  assert.equal(
    events.filter((e) => e.type === "error").map((e) => e.message),
    ["env boom"],
  );
  assert.not.ok(events.some((e) => e.type === "spawn"));
  matchEventsSnapshot("fixture.envError", files);
});

test("BSM_EVENTS reports an error in a nested bsm once, in that process", async () => {
  const { code, files } = await runWithEvents("nestedError", {
    config: eventsFixture,
  });

  assert.is(code, 1);
  assert.is(files.length, 2);
  const [inner] = files.filter((f) => f.some((e) => e.type === "error"));
  assert.ok(inner, "the inner process has the error");
  assert.equal(
    files.flat().filter((e) => e.type === "error").length,
    1,
    "the outer process only sees the exit code",
  );
  assert.equal(endOf(files.flat(), "nestedError._default"), [1, undefined]);
  matchEventsSnapshot("fixture.nestedError", files);
});

test("BSM_EVENTS logs a command's stdout and stderr, and bsm's own line, per line", async () => {
  const { code, text, files, logs } = await runWithEvents("output", {
    config: eventsFixture,
  });

  assert.is(code, 0);
  checkLogs(files, logs, text);
  const spawn = files.flat().find((e) => e.type === "spawn");
  assert.equal(
    logs[`${String(spawn?.id)}.jsonl`].map((r) => [r.stream, lf(r.log), r.bsm]),
    [
      ["stdout", `> ${String(spawn?.cmd)} \x1b[90m(output)\x1b[0m\n`, true],
      ["stdout", "out\n", undefined],
      ["stderr", "err\n", undefined],
    ],
  );
});

test("BSM_EVENTS shows which package failed under a lerna-like parallel run, with its log", async () => {
  const { code, text, files, logs } = await runWithEvents("parallel", {
    config: eventsFixture,
  });

  assert.is(code, 1);
  const events = files.flat();
  const launcher = events.find(
    (e) => e.type === "spawn" && e.cmd === "node ./test/fixtures/parallel.mjs",
  );
  assert.ok(launcher);

  // One bsm process per package, both under the launcher, named by package
  const packages = events.filter(
    (e) =>
      e.type === "start" && e.package !== undefined && e.parent === launcher.id,
  );
  assert.equal(packages.map((e) => e.package).sort(), [
    "@fixture/fail",
    "@fixture/ok",
  ]);
  const byPackage = (name: string) => {
    const root = packages.find((e) => e.package === name);
    assert.ok(root);
    return root;
  };
  const failed = byPackage("@fixture/fail");
  const ok = byPackage("@fixture/ok");
  const endCode = (id: unknown) =>
    events.find((e) => e.type === "end" && e.id === id)?.code;
  assert.is(endCode(failed.id), 2);
  assert.is(endCode(ok.id), 0);

  // The failing package's output is in its own logs, without rerunning
  const below = (id: unknown): unknown[] => {
    const children = events
      .filter((e) => e.type === "start" && e.parent === id)
      .map((e) => e.id);
    return [id, ...children.flatMap(below)];
  };
  const output = (id: unknown) =>
    below(id)
      .flatMap((n) => logs[`${String(n)}.jsonl`] ?? [])
      .filter((r) => r.bsm === undefined)
      .map((r) => [r.stream, lf(r.log)]);
  assert.equal(output(failed.id), [
    ["stdout", "fail building\n"],
    ["stderr", "broken: something went wrong\n"],
  ]);
  assert.equal(output(ok.id), [
    ["stdout", "ok building\n"],
    ["stdout", "ok done\n"],
  ]);

  // The launcher's own log is what it printed: everything, prefixed
  const raw = (logs[`${String(launcher.id)}.jsonl`] ?? []).map((r) =>
    lf(r.log),
  );
  assert.ok(raw.includes("fail: broken: something went wrong\n"));
  assert.ok(lf(text).includes("fail: broken: something went wrong\n"));
});

const notRun = (events: RunEvent[]) =>
  events
    .filter((e) => e.type === "skip")
    .map((e) => {
      const start = events.find((x) => x.type === "start" && x.id === e.id);
      return [start?.script, e.reason];
    });

test("BSM_EVENTS records array items that did not run after a failure", async () => {
  const { code, files } = await runWithEvents("failArray", {
    config: eventsFixture,
  });

  assert.is(code, 3);
  assert.equal(notRun(files.flat()), [
    ["failArray.1", "not run: failArray.0 failed"],
    ["failArray.2", "not run: failArray.0 failed"],
  ]);
  matchEventsSnapshot("fixture.failArray", files);
});

test("BSM_EVENTS records * scripts and _post that did not run after a failure", async () => {
  const { code, files } = await runWithEvents("failStar.*", {
    config: eventsFixture,
  });

  assert.is(code, 3);
  const events = files.flat();
  assert.equal(notRun(events), [
    ["failStar.b", "not run: failStar.a failed"],
    ["failStar._post", "not run: failStar.a failed"],
  ]);
  // _finally still runs
  assert.equal(endOf(events, "failStar._finally"), [0, undefined]);
  matchEventsSnapshot("fixture.failStar", files);
});

test("BSM_EVENTS records CLI scripts that did not run after a failure", async () => {
  const { code, files } = await runWithEvents("failArray envError", {
    config: eventsFixture,
  });

  assert.is(code, 3);
  const events = files.flat();
  const envError = events.find(
    (e) => e.type === "start" && e.script === "envError",
  );
  // As typed on the command line: never resolved, so no kind
  assert.equal([envError?.parent, envError?.kind], [undefined, undefined]);
  assert.equal(notRun(events).at(-1), [
    "envError",
    "not run: failArray.0 failed",
  ]);
  matchEventsSnapshot("fixture.failArray+envError", files);
});

// Windows has no signals: a killed command just exits with code 1
if (process.platform !== "win32") {
  test("BSM_EVENTS records commands killed by a signal", async () => {
    const { code, files } = await runWithEvents("signal", {
      config: eventsFixture,
    });

    // bsm exits like a shell would (128 + 15), not with 0
    assert.is(code, 143);
    const events = files.flat();
    assert.equal(endOf(events, "signal"), [143, "SIGTERM"]);
    assert.not.ok(events.some((e) => e.type === "error"));
  });

  test("BSM_EVENTS records a signal in a nested bsm", async () => {
    const { code, files } = await runWithEvents("nestedSignal", {
      config: eventsFixture,
    });

    assert.is(code, 143);
    const events = files.flat();
    // The inner process saw the signal...
    assert.equal(endOf(events, "signal"), [143, "SIGTERM"]);
    // ...the outer one only sees bsm exit with 143
    assert.equal(endOf(events, "nestedSignal"), [143, undefined]);
  });
}

test.run();
