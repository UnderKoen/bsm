import { Plugin } from "../Plugin";
import { TScripts, TScript } from "../types";
import { ConcurrentlyCommandInput } from "concurrently";

export class ConcurrentlyPlugin extends Plugin {
  public isExecutable(script: TScripts): boolean | Promise<boolean> {
    if (!Object.hasOwn(script, this.path)) return false;
    try {
      require.resolve("concurrently");
      return true;
    } catch (e) {
      return false;
    }
  }

  public async execute(
    scripts: TScripts,
    path: string[],
  ): Promise<TScript | undefined> {
    const script = scripts[this.path];

    if (typeof script === "object") {
      const con = await import("concurrently");

      if (Array.isArray(script)) {
        const { result } = con.default(
          script.map(
            (s, i) =>
              ({
                command: `bsm ~.${i}`,
                prefixColor: [
                  "green",
                  "blue",
                  "red",
                  "yellow",
                  "magenta",
                  "cyan",
                ][i],
                name: s,
                env: {
                  BSM_PATH: `${path.join(".")}.${this.path}`,
                },
              }) as ConcurrentlyCommandInput,
          ),
          {},
        );

        await result;
      } else {
        //todo
      }

      return undefined;
    } else {
      return script;
    }
  }

  public path: string = "_concurrently";
}
