import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { StringDecoder } from "string_decoder";
import { BsmError, BsmFunctionError } from "./BsmError.js";
import type { ChildProcess, StdioOptions } from "child_process";

export const EVENTS_VERSION = 1;

type Stream = "stdout" | "stderr";

/** How to run a command so its output ends up where events want it */
export type CommandOutput = {
  stdio: StdioOptions;
  /** Call right after spawning */
  attach(child: ChildProcess): void;
};

const PASSTHROUGH: CommandOutput = {
  stdio: "inherit",
  attach() {
    // Output goes straight to the terminal or pipe bsm writes to
  },
};

/**
 * Invisible markers around every node when bsm writes to a terminal. A
 * terminal ignores unknown OSC sequences; the IntelliJ plugin splits its
 * console on them to get the output per node.
 */
const marker = (kind: "start" | "end", id: string) =>
  `\x1b]7777;bsm;${kind};${id}\x07`;

export type ScriptKind = "string" | "function" | "array" | "object";

/** Extra info on a `start` event about why the script runs */
export type StartMarks = {
  /** The hook this script is (`_pre`, `_post`, `_onError`, `_catch`, `_finally`) */
  hook?: string;
  /** The script was returned by a function; its parent is that function */
  returned?: true;
};

export type RunEvent =
  | ({
      type: "start";
      id: string;
      parent?: string;
      script: string;
      /** Absent for a script that never ran and was never resolved (a CLI argument) */
      kind?: ScriptKind;
      cwd: string;
      /** Name from the nearest package.json, on the first nodes of a process */
      package?: string;
    } & StartMarks)
  | { type: "spawn"; id: string; cmd: string }
  | {
      type: "end";
      id: string;
      code: number;
      /** Set when the command was killed by a signal; `code` is then 128 + its number */
      signal?: NodeJS.Signals;
      duration: number;
    }
  | { type: "skip"; id: string; reason: string }
  | { type: "error"; id?: string; message: string };

/**
 * One node's output as JSONL, one record per line, in Docker's json-file
 * shape: `{"time","stream","log"}` plus `"bsm": true` for bsm's own output.
 * Opened on the first line, so nodes that print nothing have no file.
 */
class LogFile {
  private fd: number | undefined;
  private failed = false;
  /** Text after the last newline, per source, and when it started */
  private readonly partial = new Map<string, { text: string; time: number }>();
  private readonly decoders = new Map<string, StringDecoder>();

  constructor(private readonly file: string) {}

  write(stream: Stream, chunk: string | Uint8Array, bsm: boolean): void {
    const key = `${stream}:${String(bsm)}`;
    const text =
      typeof chunk === "string" ? chunk : this.decoder(key).write(chunk);

    const now = Date.now();
    let pending = this.partial.get(key) ?? { text: "", time: now };
    pending.text += text;

    let newline: number;
    while ((newline = pending.text.indexOf("\n")) !== -1) {
      this.record(
        stream,
        pending.text.slice(0, newline + 1),
        pending.time,
        bsm,
      );
      pending = { text: pending.text.slice(newline + 1), time: now };
    }

    if (pending.text === "") this.partial.delete(key);
    else this.partial.set(key, pending);
  }

  /** Writes what's left without a newline and closes the file */
  close(): void {
    for (const [key, decoder] of this.decoders) {
      const rest = decoder.end();
      if (rest) {
        const [stream, bsm] = key.split(":") as [Stream, string];
        this.write(stream, rest, bsm === "true");
      }
    }
    for (const [key, { text, time }] of this.partial) {
      const [stream, bsm] = key.split(":") as [Stream, string];
      this.record(stream, text, time, bsm === "true");
    }
    this.partial.clear();
    this.decoders.clear();

    if (this.fd !== undefined) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // Already closed or gone, nothing left to do
      }
      this.fd = undefined;
    }
  }

  private decoder(key: string): StringDecoder {
    let decoder = this.decoders.get(key);
    if (!decoder) {
      // Keeps multi-byte characters split across chunks intact
      decoder = new StringDecoder("utf8");
      this.decoders.set(key, decoder);
    }
    return decoder;
  }

  private record(stream: Stream, log: string, time: number, bsm: boolean) {
    if (this.failed) return;
    try {
      if (this.fd === undefined) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        this.fd = fs.openSync(this.file, "a");
      }
      const record = {
        time: new Date(time).toISOString(),
        stream,
        log,
        ...(bsm && { bsm }),
      };
      fs.writeSync(this.fd, JSON.stringify(record) + "\n");
    } catch (e) {
      // Keep running; only this log stops
      this.failed = true;
      Events.warn(`Could not write log ${this.file}`, e);
    }
  }
}

/**
 * Writes run events as JSONL when `BSM_EVENTS` is set, one file per process:
 * `root.jsonl` for the top process, `<parent node id>.jsonl` for nested ones.
 * See plans/run-events.md for the format.
 *
 * Node ids are short hashes of the path to the node (parent id, script, how
 * often that script already ran under that parent), so the same script gets
 * the same id in every run, also when processes run in parallel.
 *
 * Output per node depends on where bsm writes to:
 * - a terminal: commands keep it (interactive as always) and bsm writes
 *   invisible markers around each node, for the plugin to split on;
 * - anything else (a pipe under lerna or lage, CI, a file): commands are
 *   piped, and their output plus bsm's own goes to `logs/<id>.jsonl`.
 */
export class Events {
  private static dir: string | null | undefined = undefined;
  private static file: string | undefined = undefined;
  private static rootParent: string | undefined = undefined;
  private static rootCwd = "";
  private static claims = "";
  private static terminal = false;
  private static readonly open = new Map<string, number>();
  private static reported = new WeakSet();
  private static lastPrimitive: unknown[] = [];
  private static readonly occurrences = new Map<string, number>();
  private static exitHookInstalled = false;
  private static readonly logs = new Map<string, LogFile>();
  private static processLog: LogFile | undefined;
  private static readonly current = new AsyncLocalStorage<string>();
  private static originalWrites:
    | {
        stdout: typeof process.stdout.write;
        stderr: typeof process.stderr.write;
      }
    | undefined;
  private static readonly packages = new Map<string, string | undefined>();

  static get enabled(): boolean {
    return Events.init();
  }

  /**
   * Starts events (when `BSM_EVENTS` is set) right away instead of at the
   * first script, so output from before that is logged too.
   */
  static setup(): void {
    Events.init();
  }

  /**
   * Whether bsm writes to a terminal. Read once per process; a method so
   * tests can pretend.
   */
  static isTerminal(): boolean {
    // Typed as always true, but undefined (falsy) when stdout is a pipe or file
    return process.stdout.isTTY;
  }

  /**
   * Starts a node and returns its id, or undefined when events are disabled.
   */
  static start(
    parent: string | undefined,
    script: string,
    kind: ScriptKind | undefined,
    marks: StartMarks = {},
  ): string | undefined {
    if (!Events.enabled) return undefined;

    // The first scripts of a process hang under the node that started it. Other
    // bsm processes may start under that same node, so these ids are claimed.
    const processRoot = parent === undefined;
    parent ??= Events.rootParent;
    const scope = processRoot ? Events.relativeCwd() : "";

    const key = [parent ?? "", scope, script].join("\0");
    let n = Events.occurrences.get(key) ?? 0;
    let id: string | undefined;
    do {
      n++;
      id = Events.hash(`${key}\0${n}`);
    } while (processRoot && !Events.claim(id));
    Events.occurrences.set(key, n);
    // Claiming failed and disabled events
    if (Events.dir === null) return undefined;

    Events.open.set(id, Date.now());
    Events.write({
      type: "start",
      id,
      parent,
      script,
      kind,
      ...marks,
      cwd: process.cwd(),
      package: processRoot ? Events.packageName() : undefined,
    });
    Events.mark("start", id);
    return id;
  }

  /**
   * Runs `fn` as node `id`: bsm's own output while it runs belongs to that node.
   */
  static within<T>(id: string, fn: () => T): T {
    return Events.current.run(id, fn);
  }

  /**
   * Environment for processes started from node `id`, so nested `bsm` calls
   * link to it.
   */
  static childEnv(id: string | undefined): Record<string, string> {
    if (id === undefined) return {};
    return {
      BSM_EVENTS: Events.dir ?? "",
      BSM_PARENT_ID: id,
      BSM_ROOT_CWD: Events.rootCwd,
    };
  }

  /**
   * Records that node `id` runs `cmd` and decides how to run it. When bsm
   * doesn't write to a terminal, the command is piped and its output goes to
   * bsm's own stdout/stderr unchanged and to the node's log. Nested `bsm` calls
   * always keep bsm's stdio: the inner process handles its own commands.
   */
  static spawn(id: string | undefined, cmd: string): CommandOutput {
    if (id === undefined) return PASSTHROUGH;
    Events.write({ type: "spawn", id, cmd });

    if (Events.terminal || /^\s*bsm(\s|$)/.test(cmd)) return PASSTHROUGH;

    return {
      stdio: ["inherit", "pipe", "pipe"],
      attach(child) {
        const copy = (stream: Stream) => (chunk: Buffer) => {
          Events.terminalWrite(stream, chunk);
          Events.logFor(id).write(stream, chunk, false);
        };
        child.stdout?.on("data", copy("stdout"));
        child.stderr?.on("data", copy("stderr"));
      },
    };
  }

  /**
   * Writes to bsm's real stdout/stderr, past the capture of bsm's own output.
   */
  static terminalWrite(stream: Stream, chunk: string | Uint8Array): void {
    const original = Events.originalWrites?.[stream];
    if (original) original.call(process[stream], chunk);
    else process[stream].write(chunk);
  }

  /**
   * Ends a node. Does nothing when the node already ended or was skipped.
   */
  static end(
    id: string | undefined,
    code: number,
    signal?: NodeJS.Signals,
  ): void {
    if (id === undefined) return;
    const started = Events.open.get(id);
    if (started === undefined) return;

    Events.open.delete(id);
    Events.closeLog(id);
    Events.write({
      type: "end",
      id,
      code,
      signal,
      duration: Date.now() - started,
    });
    Events.mark("end", id);
  }

  /**
   * Ends a node that threw. The error gets an `error` event once, on the
   * innermost node it passed through; parents only end with the exit code.
   * A failing command (plain BsmError) needs no message: its code says it.
   */
  static fail(id: string | undefined, error: unknown): void {
    Events.report(id, error);
    if (error instanceof BsmError) {
      Events.end(id, error.code, error.signal);
    } else {
      Events.end(id, 1);
    }
  }

  /**
   * Writes an `error` event for an error unless it was reported already.
   * Without a node (e.g. the config failed to load) it hangs under the
   * process's parent, or has no id at the top.
   */
  static report(id: string | undefined, error: unknown): void {
    if (!Events.enabled) return;
    if (Events.isReported(error)) return;

    if (error instanceof BsmFunctionError) {
      Events.error(id, error.func.message);
    } else if (!(error instanceof BsmError)) {
      Events.error(
        id,
        error instanceof Error ? error.message || error.name : String(error),
      );
    }
  }

  private static isReported(error: unknown): boolean {
    if (typeof error === "object" && error !== null) {
      if (Events.reported.has(error)) return true;
      Events.reported.add(error);
      return false;
    }

    // Primitives can't go in a WeakSet; they pass through all parents right away
    if (Events.lastPrimitive.length > 0 && Events.lastPrimitive[0] === error)
      return true;
    Events.lastPrimitive = [error];
    return false;
  }

  /**
   * Marks a node as skipped. A skipped node gets no `end` event.
   */
  static skip(id: string | undefined, reason: string): void {
    if (id === undefined || !Events.open.has(id)) return;

    Events.open.delete(id);
    Events.closeLog(id);
    Events.write({ type: "skip", id, reason });
    Events.mark("end", id);
  }

  /**
   * Records scripts that would have run next but didn't, because `error`
   * stopped the run first. Each gets a node (with the id it gets when it does
   * run) that is skipped right away.
   */
  static notRun(
    parent: string | undefined,
    scripts: { script: string; kind?: ScriptKind; marks?: StartMarks }[],
    error: unknown,
  ): void {
    const reason =
      error instanceof BsmError
        ? `not run: ${error.script} failed`
        : "not run: an earlier script failed";

    for (const { script, kind, marks } of scripts) {
      Events.skip(Events.start(parent, script, kind, marks), reason);
    }
  }

  static error(id: string | undefined, message: string): void {
    if (!Events.enabled) return;
    Events.write({ type: "error", id: id ?? Events.rootParent, message });
  }

  static warn(message: string, e: unknown): void {
    // Never on stdout (tools pipe it), and past the capture so it can't loop
    Events.terminalWrite("stderr", `\x1b[33m${message}: ${String(e)}\x1b[0m\n`);
  }

  private static init(): boolean {
    if (Events.dir !== undefined) return Events.dir !== null;

    if (!process.env.BSM_EVENTS) {
      Events.dir = null;
      return false;
    }
    // Absolute, so nested bsm processes in other folders write to the same place
    const dir = path.resolve(process.env.BSM_EVENTS);
    const rootParent = process.env.BSM_PARENT_ID || undefined;
    // Before claiming the file: its name depends on the folder relative to this
    Events.rootCwd = process.env.BSM_ROOT_CWD || process.cwd();

    try {
      fs.mkdirSync(path.join(dir, ".claims"), { recursive: true });
      Events.file = Events.claimFile(dir, rootParent);
    } catch (e) {
      Events.disable(e);
      return false;
    }

    Events.dir = dir;
    Events.claims = path.join(dir, ".claims");
    Events.rootParent = rootParent;
    Events.terminal = Events.isTerminal();
    // Output outside any node: config errors, the final "Script failed" line
    Events.processLog = new LogFile(
      path.join(dir, "logs", "process", path.basename(Events.file)),
    );
    if (!Events.terminal) Events.captureOwnOutput();
    Events.installExitHook();
    return true;
  }

  /**
   * bsm's own output (`> cmd` lines, errors, function scripts) goes to the log
   * of the node that is running, besides the terminal. Command output is
   * written past this, so it's not logged twice.
   */
  private static captureOwnOutput(): void {
    // Kept unbound on purpose: they are put back as they were in _reset, and
    // always called with .call(process[stream])
    const originals = {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      stdout: process.stdout.write,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      stderr: process.stderr.write,
    };
    Events.originalWrites = originals;

    for (const stream of ["stdout", "stderr"] as const) {
      const original = originals[stream];
      process[stream].write = function (
        this: NodeJS.WriteStream,
        chunk: string | Uint8Array,
        ...rest: unknown[]
      ): boolean {
        if (Events.dir) {
          const id = Events.current.getStore();
          const log = id === undefined ? Events.processLog : Events.logFor(id);
          log?.write(stream, chunk, true);
        }
        return (original as (...args: unknown[]) => boolean).call(
          this,
          chunk,
          ...rest,
        );
      } as typeof process.stdout.write;
    }
  }

  private static logFor(id: string): LogFile {
    let log = Events.logs.get(id);
    if (!log) {
      log = new LogFile(path.join(Events.dir ?? "", "logs", `${id}.jsonl`));
      Events.logs.set(id, log);
    }
    return log;
  }

  private static closeLog(id: string): void {
    Events.logs.get(id)?.close();
    Events.logs.delete(id);
  }

  private static mark(kind: "start" | "end", id: string): void {
    if (Events.terminal) Events.terminalWrite("stdout", marker(kind, id));
  }

  /**
   * The `name` of the nearest package.json, so the plugin can say which
   * package (service) a nested process belongs to.
   */
  private static packageName(): string | undefined {
    const cwd = process.cwd();
    if (Events.packages.has(cwd)) return Events.packages.get(cwd);

    let name: string | undefined;
    for (let dir = cwd; ; dir = path.dirname(dir)) {
      const file = path.join(dir, "package.json");
      if (fs.existsSync(file)) {
        try {
          const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
            name?: unknown;
          };
          if (typeof json.name === "string") name = json.name;
        } catch {
          // Not valid JSON: no name
        }
        break;
      }
      if (path.dirname(dir) === dir) break;
    }

    Events.packages.set(cwd, name);
    return name;
  }

  /**
   * The top process writes `root.jsonl`. A nested process writes
   * `<node that started it>-<hash of its folder>.jsonl`: tools find a node's
   * nested processes by prefix, and every package under one `lerna run` gets
   * its own name that stays the same between runs, whatever order they start
   * in. Several processes in the same folder from one node (`bsm a && bsm b`)
   * get `-2`, `-3`, … in start order.
   */
  private static claimFile(dir: string, parent: string | undefined): string {
    const base =
      parent === undefined
        ? "root"
        : // BSM_PARENT_ID is normally an id, but it comes from the environment
          `${parent.replace(/[^\w-]/g, "_")}-${Events.hash(Events.relativeCwd())}`;
    for (let n = 1; ; n++) {
      const file = path.join(dir, `${base}${n === 1 ? "" : `-${n}`}.jsonl`);
      if (Events.createExclusive(file)) return file;
    }
  }

  /**
   * Creates the file, or returns false when it already exists. Atomic, also on Windows.
   */
  private static createExclusive(file: string): boolean {
    try {
      fs.writeFileSync(file, "", { flag: "wx" });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw e;
    }
  }

  /**
   * Claims an id across all processes of the run. Returns true on failure
   * too (events are disabled then), so callers don't loop forever.
   */
  private static claim(id: string): boolean {
    try {
      return Events.createExclusive(path.join(Events.claims, id));
    } catch (e) {
      Events.disable(e);
      return true;
    }
  }

  private static hash(key: string): string {
    return createHash("sha256").update(key).digest("hex").slice(0, 8);
  }

  /**
   * cwd relative to where the run started, so ids don't depend on where the
   * project is checked out.
   */
  private static relativeCwd(): string {
    return path.relative(Events.rootCwd, process.cwd()).replaceAll("\\", "/");
  }

  private static write(event: RunEvent): void {
    if (!Events.enabled || Events.file === undefined) return;
    const file = Events.file;

    try {
      fs.appendFileSync(
        file,
        JSON.stringify({ v: EVENTS_VERSION, t: Date.now(), ...event }) + "\n",
      );
    } catch (e) {
      Events.disable(e);
    }
  }

  private static disable(e: unknown): void {
    Events.dir = null;
    Events.file = undefined;
    Events.warn("Could not write BSM events, disabling them", e);
  }

  /**
   * process.exit() (e.g. script not found) skips the normal end events,
   * so close whatever is still open with the exit code.
   */
  private static installExitHook(): void {
    if (Events.exitHookInstalled) return;
    Events.exitHookInstalled = true;

    process.on("exit", (code) => {
      Events.closeAll(code);
      Events.processLog?.close();
    });
  }

  /**
   * Ends every open node, innermost first.
   */
  static closeAll(code: number): void {
    for (const id of [...Events.open.keys()].reverse()) {
      Events.end(id, code);
    }
  }

  /**
   * Just exists for testing purposes
   */
  static _reset(): void {
    for (const log of Events.logs.values()) log.close();
    Events.logs.clear();
    Events.processLog?.close();
    Events.processLog = undefined;
    if (Events.originalWrites) {
      process.stdout.write = Events.originalWrites.stdout;
      process.stderr.write = Events.originalWrites.stderr;
      Events.originalWrites = undefined;
    }

    Events.dir = undefined;
    Events.file = undefined;
    Events.rootParent = undefined;
    Events.rootCwd = "";
    Events.terminal = false;
    Events.open.clear();
    Events.occurrences.clear();
    Events.packages.clear();
    Events.reported = new WeakSet();
    Events.lastPrimitive = [];
  }
}
