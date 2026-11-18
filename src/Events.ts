import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { BsmError, BsmFunctionError } from "./BsmError.js";

export const EVENTS_VERSION = 1;

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
 * Writes run events as JSONL when `BSM_EVENTS` is set, one file per process:
 * `root.jsonl` for the top process, `<parent node id>.jsonl` for nested ones.
 * See plans/run-events.md for the format.
 *
 * Node ids are short hashes of the path to the node (parent id, script, how
 * often that script already ran under that parent), so the same script gets
 * the same id in every run, also when processes run in parallel.
 */
export class Events {
  private static dir: string | null | undefined = undefined;
  private static file: string | undefined = undefined;
  private static rootParent: string | undefined = undefined;
  private static rootCwd = "";
  private static claims = "";
  private static readonly open = new Map<string, number>();
  private static reported = new WeakSet();
  private static lastPrimitive: unknown[] = [];
  private static readonly occurrences = new Map<string, number>();
  private static exitHookInstalled = false;

  static get enabled(): boolean {
    return Events.init();
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
    });
    return id;
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

  static spawn(id: string | undefined, cmd: string): void {
    if (id === undefined) return;
    Events.write({ type: "spawn", id, cmd });
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
    Events.write({
      type: "end",
      id,
      code,
      signal,
      duration: Date.now() - started,
    });
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
    Events.write({ type: "skip", id, reason });
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

  private static init(): boolean {
    if (Events.dir !== undefined) return Events.dir !== null;

    if (!process.env.BSM_EVENTS) {
      Events.dir = null;
      return false;
    }
    // Absolute, so nested bsm processes in other folders write to the same place
    const dir = path.resolve(process.env.BSM_EVENTS);
    const rootParent = process.env.BSM_PARENT_ID || undefined;

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
    Events.rootCwd = process.env.BSM_ROOT_CWD || process.cwd();
    Events.installExitHook();
    return true;
  }

  /**
   * The file of a process is named after the node that started it, so tools
   * find a node's nested process at `<node id>.jsonl`; the top process writes
   * `root.jsonl`. Several processes started by one node (`bsm a && bsm b`)
   * get `-2`, `-3`, … in start order.
   */
  private static claimFile(dir: string, parent: string | undefined): string {
    // BSM_PARENT_ID is normally an id, but it comes from the environment
    const base = parent?.replace(/[^\w-]/g, "_") ?? "root";
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
    // Never write to stdout, tools pipe it
    process.stderr.write(
      `\x1b[33mCould not write BSM events, disabling them: ${String(e)}\x1b[0m\n`,
    );
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
    Events.dir = undefined;
    Events.file = undefined;
    Events.rootParent = undefined;
    Events.rootCwd = "";
    Events.open.clear();
    Events.occurrences.clear();
    Events.reported = new WeakSet();
    Events.lastPrimitive = [];
  }
}
