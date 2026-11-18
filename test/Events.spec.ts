import { suite } from "uvu";
import * as assert from "uvu/assert";
import sinon from "sinon";
import child_process from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { Executor } from "../src/Executor.js";
import { Events } from "../src/Events.js";
import { Idempotency } from "../src/Idempotency.js";
import { Logger } from "../src/Logger.js";
import { ConfigLoader } from "../src/ConfigLoader.js";
import { BsmError, BsmFunctionError } from "../src/BsmError.js";
import { TScript } from "../src/types.js";

type Event = Record<string, unknown> & { type: string; id?: string };

/**
 * A child process that prints `output`, then closes with `code`/`signal`,
 * once everyone had the chance to listen.
 */
const spawnMock = (
  code: number | null,
  signal?: NodeJS.Signals,
  output: ["stdout" | "stderr", string | Buffer][] = [],
) => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  setImmediate(() => {
    for (const [stream, text] of output) {
      child[stream].emit(
        "data",
        Buffer.isBuffer(text) ? text : Buffer.from(text),
      );
    }
    child.emit("close", code, signal);
  });
  return child as unknown as child_process.ChildProcessWithoutNullStreams;
};

let dir: string;

function readEvents(): Event[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .flatMap((f) =>
      fs
        .readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Event),
    );
}

function byScript(events: Event[], script: string): Event {
  const e = events.find((e) => e.type === "start" && e.script === script);
  assert.ok(e, `no start event for ${script}`);
  return e;
}

async function run(context: TScript, script: string[]) {
  await Executor.runScript({ s: context }, ["s", ...script], [], {});
}

const test = suite("Events");

test.before.each(() => {
  sinon.restore();
  sinon.stub(Logger, "log");
  sinon.stub(Logger, "error");
  // Piped unless a test says otherwise, also when the tests run in a terminal
  sinon.stub(Events, "isTerminal").returns(false);
  process.argv = [];
  // @ts-expect-error config is private
  ConfigLoader._config = { scripts: {} };

  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bsm-events-"));
  process.env.BSM_EVENTS = dir;
  delete process.env.BSM_PARENT_ID;
  delete process.env.BSM_ROOT_CWD;
  Events._reset();
});

test.after.each(() => {
  delete process.env.BSM_EVENTS;
  delete process.env.BSM_PARENT_ID;
  delete process.env.BSM_ROOT_CWD;
  Events._reset();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("writes nothing without BSM_EVENTS", async () => {
  delete process.env.BSM_EVENTS;
  Events._reset();
  fs.rmSync(dir, { recursive: true, force: true });
  const spawn = sinon
    .stub(child_process, "spawn")
    .callsFake(() => spawnMock(0));

  await run("echo a", []);

  assert.not.ok(fs.existsSync(dir));
  assert.not.ok("BSM_PARENT_ID" in (spawn.args[0][2].env ?? {}));
});

test("builds a tree with hooks and spawned commands", async () => {
  const spawn = sinon
    .stub(child_process, "spawn")
    .callsFake(() => spawnMock(0));

  await run({ _pre: "echo pre", _default: ["echo 1"] }, []);

  const events = readEvents();
  const root = byScript(events, "s");
  const pre = byScript(events, "s._pre");
  const def = byScript(events, "s._default");
  const item = byScript(events, "s._default.0");

  assert.is(root.parent, undefined);
  assert.is(root.kind, "object");
  assert.is(pre.parent, root.id);
  assert.is(pre.hook, "_pre");
  assert.is(def.parent, root.id);
  assert.is(def.kind, "array");
  assert.is(item.parent, def.id);
  assert.is(item.cwd, process.cwd());

  const spawns = events.filter((e) => e.type === "spawn");
  assert.equal(
    spawns.map((e) => [e.id, e.cmd]),
    [
      [pre.id, "echo pre"],
      [item.id, "echo 1"],
    ],
  );
  // Nested bsm processes link to the command that started them
  assert.is(spawn.args[1][2].env?.BSM_PARENT_ID, item.id);

  const ends = events.filter((e) => e.type === "end");
  assert.equal(
    ends.map((e) => [e.id, e.code]),
    [
      [pre.id, 0],
      [item.id, 0],
      [def.id, 0],
      [root.id, 0],
    ],
  );
  for (const e of events) assert.is(e.v, 1);
});

test("uses BSM_PARENT_ID as parent of the first script", async () => {
  process.env.BSM_PARENT_ID = "100-7";
  sinon.stub(child_process, "spawn").callsFake(() => spawnMock(0));

  await run("echo a", []);

  assert.is(byScript(readEvents(), "s").parent, "100-7");
});

test("ends failed scripts with their exit code", async () => {
  sinon.stub(child_process, "spawn").callsFake(() => spawnMock(4));

  try {
    await run({ _default: "exit 4" }, []);
    assert.unreachable();
  } catch (e) {
    assert.instance(e, BsmError);
  }

  const events = readEvents();
  const ends = events.filter((e) => e.type === "end");
  assert.equal(
    ends.map((e) => e.code),
    [4, 4],
  );
});

test("a caught error ends the object successfully", async () => {
  const spawn = sinon.stub(child_process, "spawn");
  spawn.onFirstCall().callsFake(() => spawnMock(4));
  spawn.onSecondCall().callsFake(() => spawnMock(0));

  await run({ _default: "exit 4", _catch: "echo catch" }, []);

  const events = readEvents();
  const end = (script: string) =>
    events.find((e) => e.type === "end" && e.id === byScript(events, script).id)
      ?.code;
  assert.is(end("s._default"), 4);
  assert.is(end("s._catch"), 0);
  assert.is(end("s"), 0);
});

test("idempotency hits are skipped, not ended", async () => {
  const context = { _default: "echo a" };
  sinon
    .stub(Idempotency, "hasIdempotencyEnabled")
    .callsFake((c) => c === context);
  sinon.stub(Idempotency, "checkIdempotency").returns(true);

  await run(context, []);

  const events = readEvents();
  const root = byScript(events, "s");
  assert.equal(
    events.filter((e) => e.id === root.id).map((e) => e.type),
    ["start", "skip"],
  );
  assert.is(
    events.find((e) => e.type === "skip")?.reason,
    "idempotency hash is the same",
  );
});

test("function errors are reported on the function", async () => {
  try {
    await run(() => {
      throw new Error("boom");
    }, []);
    assert.unreachable();
  } catch (e) {
    assert.instance(e, BsmFunctionError);
  }

  const events = readEvents();
  const fn = byScript(events, "s");
  assert.is(fn.kind, "function");
  const errors = events.filter((e) => e.type === "error");
  assert.equal(
    errors.map((e) => [e.id, e.message]),
    [[fn.id, "boom"]],
  );
});

test("scripts returned by a function are marked as returned", async () => {
  sinon.stub(child_process, "spawn").callsFake(() => spawnMock(0));

  await run(() => ({ _default: "echo a" }), []);

  const starts = readEvents().filter((e) => e.type === "start");
  assert.equal(
    starts.map((e) => [e.script, e.kind, e.returned]),
    [
      ["s", "function", undefined],
      ["s", "object", true],
      // Only the returned script itself, not what it runs
      ["s._default", "string", undefined],
    ],
  );
  assert.is(starts[1].parent, starts[0].id);
});

test("functions see BSM_PARENT_ID while they run", async () => {
  let seen: string | undefined;

  await run(() => {
    seen = process.env.BSM_PARENT_ID;
  }, []);

  assert.is(seen, byScript(readEvents(), "s").id);
  assert.is(process.env.BSM_PARENT_ID, undefined);
});

test("does not leave event state on shared options", async () => {
  sinon.stub(child_process, "spawn").callsFake(() => spawnMock(0));
  const options = {};

  await Executor.runScript({ a: "echo a" }, ["a"], ["s"], options);

  assert.equal(options, {});
});

test("not found errors are written before exiting", async () => {
  const exit = sinon.stub(process, "exit");

  await run({ a: "echo a" }, ["b"]);

  assert.is(exit.callCount, 1);
  const error = readEvents().find((e) => e.type === "error");
  assert.is(error?.message, "Script 's' does not have a 'b' script");
  assert.is(error?.id, byScript(readEvents(), "s").id);
});

test("closeAll ends open nodes innermost first", () => {
  const a = Events.start(undefined, "a", "object");
  const b = Events.start(a, "a.b", "string");

  Events.closeAll(127);

  assert.equal(
    readEvents()
      .filter((e) => e.type === "end")
      .map((e) => [e.id, e.code]),
    [
      [b, 127],
      [a, 127],
    ],
  );
});

test("ignores end, skip and spawn for unknown or missing ids", () => {
  Events.end(undefined, 0);
  Events.end("1-1", 0);
  Events.skip(undefined, "x");
  Events.skip("1-1", "x");
  Events.spawn(undefined, "echo");

  assert.equal(readEvents(), []);
});

test("error without a node uses the parent process node", () => {
  process.env.BSM_PARENT_ID = "100-7";

  Events.error(undefined, "boom");

  assert.is(readEvents()[0].id, "100-7");
});

test("error is a no-op when disabled", () => {
  delete process.env.BSM_EVENTS;
  Events._reset();
  fs.rmSync(dir, { recursive: true, force: true });

  Events.error(undefined, "boom");

  assert.not.ok(fs.existsSync(dir));
});

test("disables itself when the folder cannot be created", () => {
  const stderr = sinon.stub(process.stderr, "write");
  sinon.stub(fs, "mkdirSync").throws(new Error("nope"));

  const id = Events.start(undefined, "a", "string");
  stderr.restore();

  assert.is(id, undefined);
  assert.not.ok(Events.enabled);
  assert.match(String(stderr.args[0][0]), "nope");
});

test("disables itself when writing fails", () => {
  const stderr = sinon.stub(process.stderr, "write");
  sinon.stub(fs, "appendFileSync").throws(new Error("disk full"));

  Events.start(undefined, "a", "string");
  stderr.restore();

  assert.not.ok(Events.enabled);
  assert.match(String(stderr.args[0][0]), "disk full");
});

/** Simulates another bsm process writing to the same folder */
function nextProcess() {
  Events._reset();
}

test("ids are short hashes and the same in every run", async () => {
  sinon.stub(child_process, "spawn").callsFake(() => spawnMock(0));
  await run({ _pre: "echo pre", _default: ["echo 1"] }, []);
  const first = readEvents()
    .filter((e) => e.type === "start")
    .map((e) => [e.script, e.id, e.parent]);

  fs.rmSync(dir, { recursive: true, force: true });
  nextProcess();
  await run({ _pre: "echo pre", _default: ["echo 1"] }, []);
  const second = readEvents()
    .filter((e) => e.type === "start")
    .map((e) => [e.script, e.id, e.parent]);

  assert.equal(second, first);
  for (const [, id] of first) assert.match(String(id), /^[0-9a-f]{8}$/);
});

test("the same script twice under one parent gets different ids", () => {
  const a = Events.start("p", "s", "string");
  const b = Events.start("p", "s", "string");

  assert.ok(a);
  assert.not.equal(a, b);
});

test("processes started from the same node get different ids", () => {
  process.env.BSM_PARENT_ID = "abcdef12";
  const first = Events.start(undefined, "s", "string");
  nextProcess();
  const second = Events.start(undefined, "s", "string");

  assert.ok(first);
  assert.ok(second);
  assert.not.equal(first, second);
  // Named after the node that started them and their folder; the same
  // folder twice is numbered in start order
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  assert.is(names.length, 2);
  assert.match(names[0], /^abcdef12-[0-9a-f]{8}-2\.jsonl$/);
  assert.is(names[0].replace("-2.jsonl", ".jsonl"), names[1]);
});

test("nested processes in different folders get their own, stable file names", () => {
  process.env.BSM_PARENT_ID = "abcdef12";
  process.env.BSM_ROOT_CWD = process.cwd();
  const cwd = sinon.stub(process, "cwd");
  const names = (folders: string[]) => {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const folder of folders) {
      cwd.returns(path.join(process.env.BSM_ROOT_CWD ?? "", folder));
      nextProcess();
      Events.start(undefined, "build", "string");
    }
    return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  };

  const first = names(["packages/a", "packages/b"]);
  // Another run, started the other way around (like lerna --parallel)
  const second = names(["packages/b", "packages/a"]);

  assert.is(first.length, 2);
  for (const name of first) assert.match(name, /^abcdef12-[0-9a-f]{8}\.jsonl$/);
  assert.equal([...second].sort(), [...first].sort());
});

test("the top process writes root.jsonl", () => {
  Events.start(undefined, "s", "string");
  nextProcess();
  Events.start(undefined, "s", "string");

  assert.equal(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort(),
    ["root-2.jsonl", "root.jsonl"],
  );
});

test("parent ids from the environment are safe as file names", () => {
  process.env.BSM_PARENT_ID = "../a b";
  Events.start(undefined, "s", "string");

  const [name] = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  assert.match(name, /^___a_b-[0-9a-f]{8}\.jsonl$/);
});

test("a relative BSM_EVENTS is passed on as an absolute path", () => {
  // Inside the project: a temp folder can be on another drive on Windows
  const relative = path.join("node_modules", ".cache", "bsm-events-test");
  process.env.BSM_EVENTS = relative;

  try {
    const id = Events.start(undefined, "s", "string");

    assert.ok(id);
    assert.is(Events.childEnv(id).BSM_EVENTS, path.resolve(relative));
  } finally {
    fs.rmSync(relative, { recursive: true, force: true });
  }
});

test("ids of nested processes depend on their folder, not the checkout", () => {
  process.env.BSM_PARENT_ID = "abcdef12";
  process.env.BSM_ROOT_CWD = process.cwd();
  const here = Events.start(undefined, "s", "string");

  fs.rmSync(dir, { recursive: true, force: true });
  nextProcess();
  process.env.BSM_ROOT_CWD = path.dirname(process.cwd());
  const sub = Events.start(undefined, "s", "string");

  assert.not.equal(here, sub);
  assert.equal(Events.childEnv(sub), {
    BSM_EVENTS: dir,
    BSM_PARENT_ID: sub,
    BSM_ROOT_CWD: path.dirname(process.cwd()),
  });
  assert.equal(Events.childEnv(undefined), {});
});

test("disables itself when an id cannot be claimed", () => {
  const stderr = sinon.stub(process.stderr, "write");
  const writeFileSync = fs.writeFileSync.bind(fs);
  sinon.stub(fs, "writeFileSync").callsFake((file, ...rest) => {
    if (String(file).includes(".claims")) throw new Error("no claims");
    writeFileSync(file, ...rest);
  });

  const id = Events.start(undefined, "s", "string");
  stderr.restore();

  assert.is(id, undefined);
  assert.not.ok(Events.enabled);
  assert.match(String(stderr.args[0][0]), "no claims");
});

test("commands killed by a signal end with the signal", async () => {
  sinon
    .stub(child_process, "spawn")
    .callsFake(() => spawnMock(null, "SIGTERM"));

  try {
    await run({ _default: "sleep 100" }, []);
    assert.unreachable();
  } catch (e) {
    assert.instance(e, BsmError);
  }

  const ends = readEvents().filter((e) => e.type === "end");
  // 128 + 15, and the parents that failed because of it say so too
  assert.equal(
    ends.map((e) => [e.code, e.signal]),
    [
      [143, "SIGTERM"],
      [143, "SIGTERM"],
    ],
  );
  assert.not.ok(readEvents().some((e) => e.type === "error"));
});

test("unexpected errors are reported once, on the innermost node", async () => {
  try {
    await run(
      {
        a: {
          $env: () => {
            throw new Error("env boom");
          },
          _default: "echo a",
        },
      },
      ["a"],
    );
    assert.unreachable();
  } catch (e) {
    assert.instance(e, Error);
  }

  const events = readEvents();
  const errors = events.filter((e) => e.type === "error");
  assert.equal(
    errors.map((e) => [e.id, e.message]),
    [[byScript(events, "s.a").id, "env boom"]],
  );
  assert.equal(
    events.filter((e) => e.type === "end").map((e) => e.code),
    [1, 1],
  );
});

test("report writes each error once", () => {
  const error = new Error("");

  Events.report(undefined, error);
  Events.report(undefined, error);
  Events.report(undefined, "text");
  Events.report(undefined, "text");
  Events.report(undefined, new BsmError(3, "s"));

  assert.equal(
    readEvents().map((e) => e.message),
    ["Error", "text"],
  );
});

test("notRun nodes are skipped right away with the reason", () => {
  Events.notRun(
    "p",
    [
      { script: "a" },
      { script: "b", kind: "string", marks: { hook: "_post" } },
    ],
    new Error("boom"),
  );

  const events = readEvents();
  assert.equal(
    events.map((e) => [e.type, e.script ?? e.reason, e.kind, e.hook]),
    [
      ["start", "a", undefined, undefined],
      ["skip", "not run: an earlier script failed", undefined, undefined],
      ["start", "b", "string", "_post"],
      ["skip", "not run: an earlier script failed", undefined, undefined],
    ],
  );
  // Same id as when the script does run (in another run)
  Events._reset();
  assert.is(Events.start("p", "a", "string"), events[0].id);
});

test("array items after a failing one are recorded as not run", async () => {
  sinon.stub(child_process, "spawn").callsFake(() => spawnMock(3));

  try {
    await run(["exit 3", "echo b"], []);
    assert.unreachable();
  } catch (e) {
    assert.instance(e, BsmError);
  }

  const events = readEvents();
  const b = byScript(events, "s.1");
  assert.is(b.kind, "string");
  assert.equal(
    events.filter((e) => e.id === b.id).map((e) => [e.type, e.reason]),
    [
      ["start", undefined],
      ["skip", "not run: s.0 failed"],
    ],
  );
});

type LogRecord = {
  time: string;
  stream: string;
  log: string;
  bsm?: boolean;
};

function readLog(file: string): LogRecord[] {
  const full = path.join(dir, "logs", file);
  if (!fs.existsSync(full)) return [];
  return fs
    .readFileSync(full, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogRecord);
}

/** What went to the real terminal (past the capture of bsm's own output) */
function captureTerminal() {
  return sinon.stub(Events, "terminalWrite");
}

const startOf = (script: string) =>
  readEvents().find((e) => e.type === "start" && e.script === script);

test("piped command output goes to the terminal and, per line, to the node's log", async () => {
  const spawn = sinon.stub(child_process, "spawn").callsFake(() =>
    spawnMock(0, undefined, [
      ["stdout", "a\nb"],
      ["stderr", "err\n"],
      ["stdout", "c\n"],
    ]),
  );
  const terminal = captureTerminal();

  await run("echo a", []);

  assert.equal(spawn.args[0][2].stdio, ["inherit", "pipe", "pipe"]);
  assert.equal(
    terminal.args.map(([stream, chunk]) => [stream, String(chunk)]),
    [
      ["stdout", "a\nb"],
      ["stderr", "err\n"],
      ["stdout", "c\n"],
    ],
  );
  const log = readLog(`${String(startOf("s")?.id)}.jsonl`);
  assert.equal(
    log.map((r) => [r.stream, r.log, r.bsm]),
    [
      ["stdout", "a\n", undefined],
      ["stderr", "err\n", undefined],
      ["stdout", "bc\n", undefined],
    ],
  );
  assert.ok(!Number.isNaN(Date.parse(log[0].time)));
});

test("a line without newline is written when the node ends", async () => {
  sinon
    .stub(child_process, "spawn")
    .callsFake(() => spawnMock(0, undefined, [["stdout", "no newline"]]));
  captureTerminal();

  await run("echo a", []);

  assert.equal(
    readLog(`${String(startOf("s")?.id)}.jsonl`).map((r) => r.log),
    ["no newline"],
  );
});

test("characters split across chunks stay intact", async () => {
  const bytes = Buffer.from("é\n");
  sinon.stub(child_process, "spawn").callsFake(() =>
    spawnMock(0, undefined, [
      ["stdout", bytes.subarray(0, 1)],
      ["stdout", bytes.subarray(1)],
    ]),
  );
  captureTerminal();

  await run("echo a", []);

  assert.equal(
    readLog(`${String(startOf("s")?.id)}.jsonl`).map((r) => r.log),
    ["é\n"],
  );
});

test("an unfinished character is written when the node ends", async () => {
  sinon
    .stub(child_process, "spawn")
    .callsFake(() =>
      spawnMock(0, undefined, [["stdout", Buffer.from([0x61, 0xc3])]]),
    );
  captureTerminal();

  await run("echo a", []);

  assert.equal(
    readLog(`${String(startOf("s")?.id)}.jsonl`).map((r) => r.log),
    ["a�"],
  );
});

test("bsm's own output goes to the log of the running node, the rest to the process log", async () => {
  // Before events start, so the capture keeps this as the real write
  const stdout = sinon.stub(process.stdout, "write").returns(true);

  await run(() => {
    console.log("from a function");
  }, []);
  process.stdout.write("outside any node\n");

  assert.equal(
    readLog(`${String(startOf("s")?.id)}.jsonl`).map((r) => [r.log, r.bsm]),
    [["from a function\n", true]],
  );
  assert.equal(
    readLog("process/root.jsonl").map((r) => [r.log, r.bsm]),
    [["outside any node\n", true]],
  );
  // Still printed
  assert.ok(stdout.args.some(([chunk]) => chunk === "outside any node\n"));
});

test("command output is not logged twice through the capture", async () => {
  sinon
    .stub(child_process, "spawn")
    .callsFake(() => spawnMock(0, undefined, [["stdout", "once\n"]]));
  sinon.stub(process.stdout, "write").returns(true);

  await run("echo a", []);

  assert.equal(
    readLog(`${String(startOf("s")?.id)}.jsonl`).map((r) => [r.log, r.bsm]),
    [["once\n", undefined]],
  );
});

test("nested bsm calls keep bsm's stdio", async () => {
  const spawn = sinon
    .stub(child_process, "spawn")
    .callsFake(() => spawnMock(0));

  await run("bsm build", []);

  assert.is(spawn.args[0][2].stdio, "inherit");
});

test("in a terminal commands keep it and nodes are marked", async () => {
  (Events.isTerminal as sinon.SinonStub).returns(true);
  const spawn = sinon
    .stub(child_process, "spawn")
    .callsFake(() => spawnMock(0, undefined, [["stdout", "x\n"]]));
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const write = process.stdout.write;
  const terminal = captureTerminal();

  await run({ a: "echo a" }, ["a"]);

  assert.is(spawn.args[0][2].stdio, "inherit");
  // eslint-disable-next-line @typescript-eslint/unbound-method
  assert.is(process.stdout.write, write, "own output is not captured");
  assert.not.ok(fs.existsSync(path.join(dir, "logs")));

  const s = String(startOf("s")?.id);
  const a = String(startOf("s.a")?.id);
  assert.equal(
    terminal.args.map(([stream, chunk]) => [stream, String(chunk)]),
    [
      ["stdout", `\x1b]7777;bsm;start;${s}\x07`],
      ["stdout", `\x1b]7777;bsm;start;${a}\x07`],
      ["stdout", `\x1b]7777;bsm;end;${a}\x07`],
      ["stdout", `\x1b]7777;bsm;end;${s}\x07`],
    ],
  );
});

test("commands keep bsm's stdio when events are off", () => {
  delete process.env.BSM_EVENTS;
  Events._reset();

  assert.is(Events.spawn(undefined, "echo a").stdio, "inherit");
});

test("the first nodes of a process name their package", () => {
  const root = Events.start(undefined, "s", "object");
  Events.start(root, "s.a", "string");

  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    name: string;
  };
  assert.equal(
    readEvents().map((e) => [e.script, e.package]),
    [
      ["s", packageJson.name],
      ["s.a", undefined],
    ],
  );
});

test("no package without a package.json or a name in it", () => {
  const exists = sinon.stub(fs, "existsSync").returns(false);
  Events.start(undefined, "a", "string");
  exists.restore();

  const pkg = path.join(dir, "pkg");
  fs.mkdirSync(pkg);
  fs.writeFileSync(path.join(pkg, "package.json"), "{ not json");
  sinon.stub(process, "cwd").returns(pkg);
  Events.start(undefined, "b", "string");
  // Cached per folder
  Events.start(undefined, "c", "string");

  assert.equal(
    readEvents().map((e) => [e.script, e.package]),
    [
      ["a", undefined],
      ["b", undefined],
      ["c", undefined],
    ],
  );
});

test("the log stops, the command doesn't, when writing fails", async () => {
  sinon.stub(child_process, "spawn").callsFake(() =>
    spawnMock(0, undefined, [
      ["stdout", "one\n"],
      ["stdout", "two\n"],
    ]),
  );
  // Only the log: the event file is appended through openSync too
  const openSync = fs.openSync.bind(fs);
  sinon
    .stub(fs, "openSync")
    .callsFake((file: fs.PathLike, flags: fs.OpenMode) => {
      if (String(file).includes(`${path.sep}logs${path.sep}`)) {
        throw new Error("disk full");
      }
      return openSync(file, flags);
    });
  const terminal = captureTerminal();

  await run("echo a", []);

  // Both chunks still reach the terminal, the warning comes once
  const out = terminal.args.filter(([stream]) => stream === "stdout");
  const err = terminal.args.filter(([stream]) => stream === "stderr");
  assert.is(out.length, 2);
  assert.is(err.length, 1);
  assert.match(String(err[0][1]), "disk full");
});

test.run();
