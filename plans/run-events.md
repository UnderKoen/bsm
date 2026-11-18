# Plan: run events and logs in BSM

Status: steps 1 (event files) and 2 (output per node) implemented. Next: the IntelliJ plugin (`intellij-plugin.md`); `--report` is not needed yet. Draft written 2026-11-17; section 2 reworked 2026-11-18 after weighing command runners, pseudo-terminals and stdout markers against the monorepo use case.

BSM-side work for the IntelliJ plugin (`intellij-plugin.md`). Useful on its own too: a CI timing report, and per-package logs of a `lerna run` or lage run. No dependency on Lage.

## Goal

The main use case: in a monorepo run (`lerna run build`, later lage), see **which package failed and its output, without rerunning it**. Next to that, `bsm` must stay fully interactive where it runs in a terminal (`bsm preview.dev`).

When asked (`BSM_EVENTS` set), every `bsm` process records:

- which scripts run, nested across `bsm` processes and packages, with start, end, exit code and skip reason;
- the output of every node, its own lines and BSM's, either as log files or, in a terminal, as markers in the stream.

Normal use (no `BSM_EVENTS`) behaves exactly as before.

## Current code

- `Executor.executeString` is the only place that spawns commands (`shell: true`; stdio comes from `Events.spawn`). `Executor.runScript` is the choke point for script start/end, hooks and idempotency skips; it runs each node inside `Events.within`.
- `src/Events.ts` holds everything in this plan: event files, ids, logs, the capture of BSM's own output, markers.
- `BSM_LOG_FILE` still appends one line per command (time, command, script, cwd). Events replace it in the long run; keep it working.

## 1. Event files

- `BSM_EVENTS=<dir>`: each `bsm` process appends JSONL to its own file. One file per process: crash-safe, no server, no concurrent appends to one file on Windows.
  - The top process writes `root.jsonl`; a nested process writes `<id of the node that started it>-<hash of its folder>.jsonl`, the folder relative to where the run started (`BSM_ROOT_CWD`). A tool finds a node's nested processes by prefix (`<id>-*.jsonl`), and every package under one `lerna run` gets its own name that stays the same between runs, whatever order they start in. Several processes from one node in the same folder (`bsm a && bsm b`) get `-2`, `-3`, … in start order (claimed with an exclusive create); those run one after another, so the order is stable too. The `parent` field inside stays the real link.
  - A relative `BSM_EVENTS` is resolved once and passed on as an absolute path, so nested `bsm` calls in other folders (`cd packages/api && bsm build`, packages under lerna) write to the same folder.
  - Events start when `bsm` starts (`Events.setup` in `main`), so output from before the first script (config errors, `--debug`) is covered too.
- Line format (full examples in `test/snapshots/events/*.jsonl`, with times zeroed and cwd made relative):
  ```json
  {"v":1,"t":1731840000123,"type":"start","id":"263b455f","parent":"4891c0ae","script":"build.tsc","kind":"string","cwd":"/home/me/print-one/src/libs/core"}
  {"v":1,"t":1731840000124,"type":"spawn","id":"263b455f","cmd":"tsc -p tsconfig.build.json --noCheck"}
  {"v":1,"t":1731840004521,"type":"end","id":"263b455f","code":0,"duration":4398}
  ```
- **Ids are stable:** the first 8 hex characters of a SHA-256 over parent id, script path and how often that script already ran under that parent. The same script gets the same id in every run, so the plugin can compare runs (timings, keeping the tree expanded) by id, also when processes run in parallel.
  - The first scripts of a process also hash their cwd relative to where the run started (`BSM_ROOT_CWD`), so `bsm build` in two packages from one node differ, and ids don't depend on where the project is checked out.
  - Several `bsm` processes can start under one node (`bsm a && bsm a`, `lerna run`). Their first ids are claimed with an exclusive create in `<dir>/.claims/`; on a clash the occurrence counter goes up. Identical scripts started in parallel can swap ids between runs, but they're interchangeable.
- A process's first script uses `BSM_PARENT_ID` from its environment as `parent`.
- When spawning a command (or running a function), BSM sets `BSM_PARENT_ID=<id of that script>`, `BSM_ROOT_CWD` and the absolute `BSM_EVENTS`, so `bsm build` → `lerna run build` → `npm run build` → `bsm build` (per package) → `tsc` is one tree.
- Every script BSM walks through is a node: object and array scripts are grouping nodes, `_default`/`_win32`/… and hooks are nodes too. The scripts root itself is not.
- Types:
  - `start`: `script` (dotted path), `kind` (`string`, `function`, `array`, `object`), absolute `cwd`, `parent`. Hooks (`_pre`, `_post`, `_onError`, `_catch`, `_finally`) are normal nodes with a `hook` field. A script returned by a function is a child of that function with the same `script` path and `"returned": true`. The first nodes of a process carry `package`: the `name` of the nearest `package.json`, so a tree can say "order-service › build failed".
  - `spawn`: the command line actually run, including args. Only for string scripts that start a process (not for `""`).
  - `end`: exit code, duration in ms. A script whose error was handled by `_catch` ends with 0; the failing child keeps its own code. A command killed by a signal gets `signal` (`"SIGTERM"`) and code 128 + its number (143); the parents that fail because of it carry the same code and signal.
  - `skip`: idempotency hit, with the reason. Ends the node; no `end` follows.
  - **Not run:** when a script fails, the scripts that would have run next and now won't get a `start` + `skip` with reason `not run: <failed script> failed`, using the same id they get when they do run. This covers the remaining CLI scripts (`bsm lint test`), the remaining items of an array or `*` loop, and `_post` (which only runs after success; `_finally` still runs). It also shows when `_catch` handled the error but the loop still stopped. Alternatives that were never going to run (`_win32` vs `_default`) are not recorded. CLI scripts are recorded as typed, without `kind`, because they were never resolved.
  - `error`: a message for a failure that the exit code alone doesn't explain: script not found, a function or `$env` function threw, any other unexpected error. Written once, on the innermost node the error passed through; parents only `end`. A command exiting non-zero gets no `error` (its output says why). Errors before any script runs (config missing or failing to load) have no `id` in the top process.
- On `process.exit()` (script not found), every open node gets an `end` with the exit code from an exit handler. A hard kill (SIGKILL, closing the terminal) leaves nodes open; readers should treat a node as ended when its process is gone.
- Version the format (`"v": 1`) from day one; the plugin will lag behind BSM releases.
- Never write events to stdout; other tools pipe BSM's output.

## 2. Output per node

What BSM can do depends on where it writes to. It decides once per process, from `process.stdout.isTTY`:

| `bsm` writes to | Typical case                                                                                   | Commands                                                   | Output per node                                       |
| --------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| a terminal      | `bsm preview.dev`, `bsm lint`, the top `bsm` the IntelliJ plugin starts (in a pseudo-terminal) | inherit it: colours, shortcuts, prompts, exactly as always | **markers** in the stream, for the plugin to split on |
| anything else   | a package's `bsm` under `lerna run` or lage, CI, redirected to a file                          | piped, copied unchanged to bsm's stdout/stderr             | **log files**, written by BSM                         |

A command piped this way never had a terminal to lose: under lerna or lage, `bsm` itself is already piped. So interactivity is untouched where it exists, and logs exist where parallel runs make the terminal useless: the packages.

### Log files (no terminal)

- `logs/<id>.jsonl` per node, in Docker's `json-file` shape, **one record per line**:

  ```json
  {"time":"2026-11-18T10:15:02.512Z","stream":"stdout","log":"> tsc -p tsconfig.build.json (build.tsc)\n","bsm":true}
  {"time":"2026-11-18T10:15:04.120Z","stream":"stderr","log":"src/a.ts(3,1): error TS2304: Cannot find name 'x'.\n"}
  ```

  - `stream`: `stdout` or `stderr`; `log`: the line exactly as printed (ANSI codes included); `time`: when the line started; `bsm: true`: BSM's own output rather than the command's.
  - Text after the last newline is written when the node ends. No partial-line concept: the logs are for inspecting, the terminal or run console shows the exact stream.
  - Bytes are decoded per stream with a string decoder, so multi-byte characters split across chunks stay intact.
  - The file only exists if the node printed something. It's opened on the first line and closed when the node ends.

- **Own lines only:** a node's log holds what was printed while that node itself ran, not its children's output. Readers combine a subtree by merging the files by `time` (one writer per file, nothing stored twice).
- **BSM's own output** (`> cmd` lines, `Script 'x' does not exist`, `console.log` in function scripts) goes to the running node's log: `runScript` tracks the current node with `AsyncLocalStorage`, and `process.stdout`/`process.stderr` writes of the `bsm` process are copied to that node's log. Command output is written past this capture, so it's not logged twice.
- **Outside any node** (config errors, `--debug`, the final `Script failed with code …` and its stack trace) output goes to `logs/process/<event file name>.jsonl` (`logs/process/root.jsonl`, `logs/process/<parent id>-<folder hash>.jsonl`). An `error` event without an id pairs with it. It's a separate folder so process logs can never collide with node logs.
- **Nested `bsm` commands** (the command starts with `bsm`) are not piped: the inner process inherits bsm's stdout/stderr and logs its own nodes. The outer node only has BSM's own `> bsm …` line.
- **Commands that run `bsm` somewhere inside** (`lerna run build`, `npm run build`, `cross-env X=1 bsm build`) are ordinary commands to BSM: they are piped and their log is everything they printed. For `lerna run` that includes every package's output (prefixed by lerna), which overlaps with the packages' own logs. That's on purpose: it's what lerna printed, it's the only record of lerna's own messages and of packages that don't use `bsm`, and preventing it would need stripping marked output from wrappers that prefix, buffer and reorder. Readers resolve it: a node that has nested `bsm` processes shows its children's logs by default, its own log as "raw output".
- If a log can't be written, a warning goes to stderr once and the command keeps running.

### Markers (terminal)

- With `BSM_EVENTS` set and stdout a terminal, BSM writes an invisible marker before and after every node, on stdout: `ESC ] 7777 ; bsm ; start ; <id> BEL` and `… ; end ; <id> BEL`. Terminals ignore unknown OSC sequences.
- Commands inherit the terminal and run one after another at each level, nested `bsm` processes write their own markers into the same terminal, so everything between a node's markers belongs to it (innermost open node wins). That includes BSM's own lines.
- No log files are written in this case. The IntelliJ plugin splits its console on the markers and writes the same `logs/<id>.jsonl` format itself (`stream: "pty"`), so its tree code reads one format for both cases.
- Something like `lerna run` inside such a run is one node: its interleaved output goes to that node, while the packages' clean output comes from their own logs (they're piped under lerna).
- **To verify (spike):** that the markers survive IntelliJ's console pseudo-terminal on Windows (ConPTY has swallowed unknown sequences before). If they don't: write a visible text marker instead, only when asked for (an env var the plugin sets), and let the plugin hide it.

### Input

- Terminal: commands inherit stdin and the terminal, exactly as before. The plugin's run console is a pseudo-terminal, so typing there reaches the command.
- No terminal: stdin is inherited too, but under lerna, lage or CI nobody types. No prompt detection in BSM; the plugin can show a "may be waiting" hint from its console itself.

## Steps

1. ~~Event files~~ Done: `src/Events.ts`, emitted from `Executor.runScript` and friends. Tests in `test/Events.spec.ts` and `test/bin.ts` (every bin command also has an events snapshot in `test/snapshots/events/`). Signals, errors for every unexpected failure, config load failures, not-run scripts and `package` are covered too.
2. ~~Output per node~~ Done: log files when stdout isn't a terminal, BSM's own output per node and per process, markers in a terminal. Every bin command test checks that all logs together hold exactly the lines the terminal showed, each once. A parallel fixture (`test/fixtures/parallel.mjs`, a stand-in for `lerna run`) checks that the failing package is visible with its own log. Markers are unit-tested; their survival through IntelliJ's console on Windows still needs the spike.

**Done when:** in print-one, `bsm build` with `BSM_EVENTS` set shows each package under `lerna run build` as its own subtree with `package` set and its own logs, and `bsm preview.dev` stays interactive.

## Later ideas (not planned)

- **`bsm --report <dir>`**: read the event files and print the slowest scripts, failures and skip counts, for a CI timing summary without the plugin.

- **A replaceable command runner** (`BSM_EXEC`): BSM spawns every command through a runner it hands the prepared argv, cwd and env. It would let the plugin give each command its own console with a pseudo-terminal and its own input, also for parallel commands. Not needed for the monorepo use case; worth it only if per-command interactivity becomes important.
- **Pseudo-terminals in BSM** (`node-pty`): commands keep a terminal _and_ BSM sees their output, so logs exist in the terminal case too. Costs a native dependency and keyboard/resize forwarding. The fallback if markers don't survive the console.
- **Events over stdout** (for IntelliJ run targets in WSL, Docker or SSH, where the IDE can't read a local temp folder): the same event lines, prefixed, in the output stream.

## Pitfalls

- Nested `bsm` calls resolve through PATH, and `node_modules/.bin` is appended to the end of it. A global `bsm` install wins over the local one, so a nested call can run an older BSM that writes no events. The tree then just stops at that command.
- Under lerna, check that every package actually reaches `bsm` (not a plain `npm` script) and that lerna passes the environment through; packages without `bsm` show up only in lerna's raw output.
- Ids are 32 bits; a clash within one run is very unlikely but not impossible. Go to more characters if it ever happens.
- Logs can grow large for watch scripts, and JSON escaping adds 30–50% (mostly ANSI codes). Cap each log (for example 50 MB, then drop the oldest records) or let the plugin clean up its temporary folder.
- Two pipes can race: a write to stderr right after one to stdout may arrive first, so lines of one command can be out of order between streams by a few milliseconds.
