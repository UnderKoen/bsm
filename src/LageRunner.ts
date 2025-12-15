import type { TargetRunner, TargetRunnerOptions } from "@lage-run/runners";
import { RunnerResult } from "@lage-run/runners/lib/types/TargetRunner.js";
import { Target } from "@lage-run/target-graph";

const random = Math.floor(Math.random() * 1000);

export default class BsmLageRunner implements TargetRunner {
  async shouldRun(target: Target): Promise<boolean> {
    console.log(`Should run ${random} ${target.id}?`);
    return true;
  }

  async run(options: TargetRunnerOptions): Promise<RunnerResult> {
    console.log("Running BsmLageRunner...");
    console.error("IGGGGGGGGGG");
    console.error(`Running ${random}  ${options.target.id}`);

    throw {
      exitCode: 10,
      error: new Error(`Running ${random}  ${options.target.id}`),
    };
  }

  cleanup?(): Promise<void> | void {
    throw new Error("Method not implemented.");
  }
}
