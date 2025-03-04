/* c8 ignore start */
//TODO find a way to test this

import { createPrompt, useState, useKeypress, useMemo } from "@inquirer/core";
import { TConfig, TScript, TScripts } from "./types";
import minimist from "minimist";
import { Help } from "./Help";
import { Executor } from "./Executor";

export class Interactive {
  static async selectScript(
    config: TConfig,
    argv: minimist.ParsedArgs,
  ): Promise<string[]> {
    const arg = argv._[0]?.replace(/^~/, process.env.BSM_PATH ?? "~") ?? "";
    const args = arg.split(".");

    const initial: [string, TScript][] = [];
    let par: TScript[] | TScripts = config.scripts;
    for (const arg of args) {
      let child: TScript | undefined;
      if (Array.isArray(par)) {
        child = par[Number.parseInt(arg)];
      } else {
        child = par[arg];
      }

      if (typeof child !== "object") break;
      initial.push([arg, par]);
      par = child;
    }

    return createPrompt<string[], { message: string }>((_c, done) => {
      const [parent, setParent] = useState<[string, TScript][]>(initial);
      const [self, setSelf] = useState<TScript>(par);

      const helps = useMemo(() => {
        if (typeof self === "string" || typeof self === "function") {
          return [];
        } else {
          return Object.entries(self)
            .map((e) => [e[0], e[1], Help.getCommandHelp(e[1], [e[0]])])
            .filter((e) => e[2] !== undefined) as [string, TScript, string][];
        }
      }, [self, parent]);

      const [selected, setSelected] = useState<number>(0);
      const [finished, setFinished] = useState<boolean>(false);

      const size = helps.length;
      const selectedName = helps[selected][0];
      const selectedValue = helps[selected][1];

      const scriptName = [...parent.map((e) => e[0]), selectedName].join(".");
      const prefix = `\n\x1b[1mRun command » \x1b[90m${scriptName}\x1b[0m`;
      if (finished) {
        done([scriptName]);
        return prefix;
      }

      function right() {
        if (typeof selectedValue !== "object") return;

        setSelected(0);
        setParent([...parent, [selectedName, self]]);
        setSelf(selectedValue);
      }

      useKeypress((key) => {
        if (key.name === "up") {
          setSelected((selected - 1 + size) % size);
        } else if (key.name === "down") {
          setSelected((selected + 1) % size);
        } else if (key.name === "left") {
          if (parent.length === 0) return;

          const newParent = parent.slice(0, -1);
          const newSelf = parent[parent.length - 1];

          setSelected(Object.keys(newSelf[1]).indexOf(newSelf[0]));
          setParent(newParent);
          setSelf(newSelf[1]);
        } else if (key.name === "right") {
          right();
        } else if (key.name === "return") {
          if (Executor.isExecutable(selectedValue)) {
            setFinished(true);
          } else {
            right();
          }
        }
      });

      const commands = helps
        .map(
          (v, i) =>
            `${i === selected ? "\x1b[32m\x1b[1m> \x1b[4m" : "  "}${v[2]}`,
        )
        .join("\n");

      return `${prefix}\n${commands}\x1b[?25l`;
    })({
      message: "test",
    }).catch(() => process.exit(1));
  }
}
