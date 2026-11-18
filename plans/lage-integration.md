# Plan: Lage integration for BSM

Status: not started. Draft written 2026-11-17.

## Goal

Replace Lerna/Nx in print-one with Lage, driven by BSM:

- Packages declare their Lage targets and dependencies in `package.scripts.js` with a `$lage` key.
- BSM generates the Lage config from those declarations.
- Lage runs BSM directly (no `npm run` in between), with caching.
- `bsm build` at the root keeps working.

Example of what this enables: `prisma.generate` only runs before the builds that need it (the package itself, and nest-commons for the five services whose clients it imports), instead of a global `lerna run setup:prisma --concurrency 1` step.

## Facts checked (Lage 2.17.1, Nov 2026)

- Pipeline keys can be `pkg#task` (parsed in `WorkspaceTargetGraphBuilder`).
- Unknown packages in `dependsOn` throw `Package "x" not found`, so the generator must filter.
- `lage.config.js` is loaded via cosmiconfig inside an async function, so exporting a Promise works. This is an implementation detail, not documented.
- Custom runners: `runners: { bsm: { script, options } }`, targets use `type: "bsm"`. A runner implements `shouldRun(target)` and `run({ target, weight, abortSignal })`.
- Custom reporters: config option `reporters: Record<string, string>`.
- Cache storage: backfill accepts `cacheStorageConfig.provider` as a function returning `{ fetch(hash), put(hash, files) }`. Lage's types exclude it, but Lage passes it through at runtime. Pin the Lage version.
- CLI flags: `--continue`, `--scope`, `--to`, `--since`, `--no-deps`/`--no-dependents`, `--concurrency`, `--no-cache`, `--reset-cache`.

## Constraints from the current BSM code

- `ConfigLoader` and `Executor` are static and resolve against `process.cwd()`. print-one presets also read `process.cwd()` at load time (`lib.js`), and Node caches those modules. Package configs must therefore be read in **one `bsm` process per package**, never in-process.
- `dist/index.js` starts the CLI as soon as it is imported. There is no library API yet.
- `$idempotency` skips unchanged work but cannot restore outputs. Under Lage, Lage's cache decides; BSM idempotency stays for uncached targets and for direct `bsm` runs.

## Phase 1: BSM can describe a package

1. **Library entry point.** Split the CLI bin from an importable entry. Add `exports` for `./lage` and `./lage-runner`.
2. **Accept a `$lage` key** in `types.ts`: `dependsOn`, `inputs`, `outputs`, `cache`, `maxWorkers`. JSON only, no functions. Check that `*` runs and `--help` skip it like other `$` keys.
3. **`bsm --lage-targets`.** Load the config in the current folder, walk the scripts tree, print `{ "<dotted.path>": $lage }` as JSON. Tests: nested paths (`prisma.generate`), aliases ignored, a config without `$lage` prints `{}`.
   **Done when:** `bsm --lage-targets` in a fixture package prints the expected JSON.

## Phase 2: Lage integration

Start from the stub on `origin/chore/lage` (`src/LageRunner.ts`, `lage.config.cjs`). The stub always throws, and its config has a typo: `provide: "local-skip"` should be `provider`.

4. **Runner, `@under_koen/bsm/lage-runner`.**
   - `run` spawns `node <bsm bin> <task> -- <taskArgs>` with `cwd: target.cwd`, kills the process on abort, returns its exit code.
   - Sets `BSM_DISABLE_IDEMPOTENCY=true` when the target is cached by Lage.
   - Passes the environment through unchanged, so run events keep working (see "Run events" below).
   - `shouldRun` returns `true` (only packages that define the script get a target).
5. **Config builder, `createLageConfig(base)` in `@under_koen/bsm/lage`.**
   - List workspaces with `workspace-tools` (already a Lage dependency).
   - Run `bsm --lage-targets` in each package that has a `package.scripts.*`, in parallel. Without `BSM_EVENTS` in their environment: they only describe the package, and with it each would claim the event file name its package's real target should get (see "Run events").
   - Emit `"<pkg>#<task>": { type: "bsm", ...$lage }` plus `runners.bsm`, then merge `base`.
   - Filter out `dependsOn` entries that point at targets which don't exist.
6. **Package aliases.**
   - `defaultScope: "@print-one"`: a bare name like `order-service` resolves to `@print-one/order-service` when that package exists. Full names still work. Unknown names fail with a clear error.
   - Optional explicit map: `aliases: { orders: "order-service", nc: "nest-commons" }`. An alias that equals an existing package name fails loudly.
   - No implicit suffix guessing (`order` → `order-service`); put that in the map.
   - Resolve every `dependsOn` entry before filtering. Export `resolvePackage(name)` so the CLI uses the same resolver.
7. **Tests:** a fixture monorepo with two packages. Check dependency order, alias resolution, and a full cache hit on the second run.

**Done when:** `lage build` in the fixture runs through BSM in the right order, and the second run comes entirely from the cache.

Phases 1 and 2 need a BSM release before phase 3.

## Phase 3: switch print-one over (print-one repo)

8. **`lage.config.js`:**
   ```js
   module.exports = require("@under_koen/bsm/lage").createLageConfig({
     npmClient: "npm",
     defaultScope: "@print-one",
     cacheOptions: { environmentGlob: ["**/.env.*"] },
   });
   ```
   Local cache only for now.
9. **`$lage` in the presets** (`src/libs/script-commons/`):
   - `lib`: `build` depends on `^build`, outputs `dist/**`.
   - `nest`: `build` depends on `^build` and `prisma.generate`.
   - `postgres`: `prisma.generate` with `cache: false`.
   - `common`: `check` depends on `^build`.
   - `vitest`: `test` depends on `^build`; cache per package only once trusted.
   - Remove the `dependencies` entries from `lib.js` `$idempotency`; `^build` covers them.
10. **nest-commons:**
    ```js
    build: {
      $lage: {
        dependsOn: [
          "^build",
          ...["auth", "billing", "customfile", "notification", "order"].map(
            (s) => `${s}-service#prisma.generate`,
          ),
        ];
      }
    }
    ```
11. **Root `package.scripts.js`:** `lerna run X --no-bail` → `lage X --continue`. Use `--scope` for the `*test*` exclusion and `--since` for `SINCE=1`. Remove `setup:prisma --concurrency 1` from `setup.subprojects`.
12. **Remove Lerna/Nx:** drop `lerna`, `nx`, `nx.json`, `lerna.json`. Replace `npx lerna run deploy:connection` in `deploy-connections.yml`, and `lerna ls` in `scripts/changed.js` with `workspace-tools` or `lage info`.

**Done when:** `bsm setup`, `bsm build`, `bsm check` and `bsm test` pass locally and in CI, and a second `bsm build` with nothing changed is a cache hit.

## Phase 4: parallel long-running commands and CLI

Lage can't orchestrate commands that never finish (`start`, `start.dev`, `scoped.*`, `build:watch`, `test.watch`).

13. **`$parallel: true` on array scripts** in BSM, with `concurrently` as an optional dependency. Salvaged from `feature/parallel` (`ConcurrentlyPlugin`); don't revive that branch, master already replaced its plugin loop with `objectScripts`.
14. **`bsm <task> --graph [--to <pkg>] [--scope <pkg...>]`.** Resolve the BSM script name (aliases, case) and package aliases, then run `lage <resolved> --to @print-one/<pkg>`. Inside a package folder, `--to` defaults to that package.
15. **print-one:** rewrite `start`, `start.dev`, `scoped.*`, `start.libs` as `$parallel` lists with short package names instead of the `"@print-one/{...}"` brace pattern.

**Done when:** `bsm scoped orders` works without Lerna.

## Phase 5: CI and Docker speed (print-one repo)

16. **Remote cache:** a small GCS cache provider in print-one (`fetch(hash)` / `put(hash, files)`). Pin the Lage version.
17. **Docker:** build on the runner with the cache and copy `dist` into the images. At minimum, remove `no-cache: true` and copy only `package*.json` before `npm install`.
18. **Measure** deploy time before and after (CI step timings). Keep the numbers in the PR.

## Run events

How `BSM_EVENTS` (`run-events.md`) works under Lage. Verified with lerna in print-one on 2026-11-18; Lage should behave the same, because nothing in it depends on lerna.

- **No integration needed for the tree.** `bsm build` → `lage build` is an ordinary command node, so Lage inherits `BSM_EVENTS`, `BSM_PARENT_ID` and `BSM_ROOT_CWD` and the runner passes them on. Every target's `bsm` nests under the `lage` node with its `package` label, in its own stable event file (`<lage node id>-<package folder hash>.jsonl`).
- **Logs per target.** Lage captures each target's output, so each target's `bsm` runs piped and writes its own logs. Lage's own output (progress, summary) lands in the `lage` node's raw log, like lerna's does today.
- **Cleaner failure output than lerna.** Under lerna, `npm run` sits between lerna and each package's `bsm`, and npm's `npm error path …`/`npm error workspace …` lines only end up in lerna's raw output. The Lage runner starts `bsm` directly, so a target's output is only what `bsm` and its commands print, all in that target's logs.
- **`bsm --lage-targets` must run without `BSM_EVENTS`** (step 5). It runs once per package from inside the `lage` process, with the same parent and folder as that package's real target, so it would claim `<lage>-<folder>.jsonl` and push the real target to `-2`. Alternatively, BSM could create its event file only at the first event instead of at startup; then any `bsm` call that runs no script leaves no file.
- **Cache hits are invisible.** On a cache hit Lage replays the target's output without running it: no `bsm` process, so no node and no logs, only the replayed output in the `lage` node's raw log. If the tree should show them, a Lage reporter (config option `reporters`) can write a `start` + `skip` with reason `cache hit` per cached target, under the `lage` node, with the id the target's process would get. Not needed to start; add it when the plugin shows "missing" packages.
- **Test:** the fixture monorepo from step 7, run with `BSM_EVENTS`: each target is a node under the `lage` node, with its own logs; the second (cached) run has no target nodes unless the reporter exists.

## Out of scope

- A general plugin system. Revisit if a second user needs to extend BSM. If built, design it around today's code: object keys (`objectScripts`), `$` metadata handlers, before/after-run hooks, CLI flags.
- The IntelliJ plugin (`intellij-plugin.md`). It reads the same events under Lage as under lerna.
- Real semver or publishing the libs to a registry.
- Lage caching for `prisma.generate` until the client is generated inside the package (today it writes to root `node_modules/.prisma/<name>`, outside the package).

## Risks

- **Startup cost:** one `bsm` process per package (about 40) every time Lage starts. Measure in phase 3; if slow, cache the JSON keyed on the config files BSM loaded.
- **Prisma generates may collide.** Today's `--concurrency 1` suggests shared files. If so, give `prisma.generate` `maxWorkers: 1`.
- **Cached tests can go stale.** DB/Redis tests hit the cache wrongly unless their inputs are declared. Phase 3 caches only `build` and `check`.
- **Undocumented Lage behaviour** (async config, custom cache provider). Pin the version and re-check on upgrades.
