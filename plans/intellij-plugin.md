# Plan: IntelliJ plugin for BSM runs

Status: idea. Reworked 2026-11-18 around the monorepo use case. Needs the BSM-side work in `run-events.md` (events, output per node). Independent of the Lage plan.

## Goal

Better than the terminal, mainly for monorepo runs:

- **which package failed, and its output, without rerunning it** (`lerna run build`, later lage);
- the whole run as a tree with status and timings: what failed, what was skipped, what didn't get to run;
- the run itself stays exactly as in a terminal, including interactive commands like `bsm preview.dev`;
- compare with the previous run, jump to a script's entry in `package.scripts.js`, rerun one node.

## Approach

- **Main view: the run console.** The plugin starts the top `bsm` in a pseudo-terminal (`PtyCommandLine`). It shows everything exactly as a terminal would, accepts input, and is the source of truth.
- **The tree: an index into that output.** Built from the event files and the per-node logs in a temporary folder the plugin passes as `BSM_EVENTS`. Format in `run-events.md` sections 1–2. The plugin checks `"v"` and shows a clear "update the plugin" message for unknown versions instead of guessing.
- **Logs come from two writers, in one format** (`logs/<id>.jsonl`):
  - processes without a terminal (every package under `lerna run` or lage) write their own logs;
  - for processes in the run console (the top `bsm` and its direct nested calls), the plugin writes them: BSM puts invisible markers around every node in the stream, and the plugin's splitter cuts the console output on them.

  So the tree code has one input, events plus log files, and doesn't care which case produced them.

## 1. Run tree

- Use IntelliJ's Build tool window API, as the Gradle and Maven integrations do (`BuildViewManager` with start, progress, output and finish events carrying parent ids). Gives a tree, timings, red failed nodes and an output pane per node without custom UI.
- Event mapping:
  - `start` → start event; label the first node of a nested process with its `package` ("@print-one/order-service › build"); a `hook` field names the hook, `returned` marks a script returned by a function;
  - `end` → finish, success or failure by exit code; with a `signal`, cancelled when the user stopped it, otherwise failed with the signal name;
  - `skip` → finish as skipped with the reason; "not run: … failed" nodes are shown greyed as not run;
  - `error` → message on the node, or on the run itself when it has no id (for example a config that failed to load).
- Open nodes: when a node ends, or the `bsm` process the plugin started exits, every descendant that is still open ends as cancelled. This covers stopping the run (Node skips exit handlers on signals) and nested `bsm` processes that crashed.
- Watch the folder with a file watcher plus a short poll fallback (Windows file events on temp folders are unreliable), and read each `.jsonl` incrementally from the last offset. Start at `root.jsonl`; a node's nested processes are in `<its id>-<folder hash>.jsonl`, one per folder (every package under `lerna run` has its own), with `-2`, `-3`, … when it started several in the same folder. File names are stable between runs.
- Ids are stable between runs: keep the tree expansion and show "took 4.1 s, last time 6.3 s" by matching nodes by id.
- A failed package should be findable in one step: failed nodes bubble up (ancestors show "1 package failed"), and the tree can filter to failures.

## 2. Output per node

- Selecting a node shows its output: its own `logs/<id>.jsonl` plus all its descendants', merged by `time`. Selecting `lint` shows `tsc`, `eslint` and `prettier`; selecting the `lerna run build` node shows every package, as it happened. A toggle can switch to "grouped per child".
- **Nodes with nested `bsm` processes** (a `<id>-*.jsonl` event file exists, or start events in other files have the node as parent): when merging, such a node contributes its children's logs, not its own. Its own log, for `lerna run` everything lerna printed with prefixes, stays available as "raw output". Nothing appears twice either way.
- Lines with `bsm: true` (BSM's own `> cmd` lines, errors) can be dimmed or hidden; error lines stay visible.
- The root node shows the run console itself.
- **Splitter (terminal case):** the plugin reads the run console's output as it arrives, keeps a stack of open nodes from the markers (`ESC ] 7777 ; bsm ; start|end ; <id> BEL`), strips the markers from what the console shows, and appends each piece of text to the innermost open node's `logs/<id>.jsonl` with `stream: "pty"`, one record per line, same as BSM's own logs.
- The temporary folder is kept for the last few runs and deleted after that, or on project close.

## 3. Input

- Typing goes to the run console, as in a terminal. Interactive commands run in the console's pseudo-terminal, so prompts, shortcuts and raw mode work as they do in a terminal.
- Packages under lerna or lage have no terminal (lerna pipes them), so there's nothing to type into there, same as today.
- Optional hint: when the console's last output doesn't end in a newline and nothing new arrived for a second, mark the running node "may be waiting for input" and offer to focus the console. A hint only; a stalled build can trigger it.

## 4. Running

- A BSM run configuration type: script name, working directory, extra args, env. Starting it creates a fresh temporary folder for `BSM_EVENTS`, starts `bsm` in a pseudo-terminal, and shows the run console and the tree.
- Gutter run icons on script keys in `package.scripts.js` (and `.cjs`/`.mjs`/`.json`) that create and start such a configuration.
- Stop kills the top `bsm`'s process tree (`taskkill /T` on Windows).
- Rerun a single node: run `bsm <script>` with that node's cwd (its `package` folder), as a new run.

## Phases

0. **Spike:** do the markers survive IntelliJ's console pseudo-terminal on Windows and Unix? Run `bsm` with `BSM_EVENTS` set in a run configuration with "Emulate terminal", and check the raw process output for the `ESC ] 7777` sequences. If they don't survive, ask BSM for visible text markers instead (`run-events.md` section 2).
1. **Tree:** run configuration, Build window tree from event files, package labels, failures bubbling up. Output per node from the logs written by piped processes (packages under lerna). Needs `run-events.md` steps 1–2.
2. **Splitter:** per-node output for the terminal case from the markers.
3. **Comparing and navigation:** timings against the last run, gutter icons, jump to a script's entry, rerun a node.
4. **Input hint** (optional).

## Out of scope for now

- Runs not started from the plugin (for example a terminal with `BSM_EVENTS` set by hand). Possible later by watching a fixed folder; they'd have logs for piped processes only.
- IntelliJ run targets (WSL, Docker, SSH): the plugin reads a local temp folder. Supporting them means sending events through the output stream instead (`run-events.md`, later ideas).
- A console per command with its own input (a replaceable command runner, `run-events.md` later ideas).

## Pitfalls

- The plugin lives in its own repo and releases on its own schedule; keep it working against older event versions.
- Pseudo-terminals differ between Windows (ConPTY) and Unix; test the console, input, Ctrl+C and the markers on both.
- Log timestamps come from different processes; merging by `time` is right to the millisecond, so lines of parallel packages within the same millisecond can interleave arbitrarily.
- Packages that don't run `bsm` only show up in the raw output of the `lerna run` node.
