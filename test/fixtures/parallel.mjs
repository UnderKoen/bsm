// A tiny stand-in for `lerna run build`: runs `bsm build` in every package
// under ./monorepo at the same time, with piped output prefixed by the
// package folder, and fails when any of them fails.
// (Not "packages": .gitignore ignores every **/packages/* folder.)
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "monorepo");
const packages = fs.readdirSync(root).sort();

// Each package finds its own package.scripts.mjs, not the outer config
const env = { ...process.env };
delete env.BSM_CONFIG;

const prefix = (name, target) => {
  let partial = "";
  return (chunk) => {
    const lines = (partial + chunk).split("\n");
    partial = lines.pop();
    for (const line of lines) target.write(`${name}: ${line}\n`);
  };
};

const codes = await Promise.all(
  packages.map(
    (name) =>
      new Promise((resolve) => {
        const child = spawn("bsm build", {
          cwd: path.join(root, name),
          env,
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.setEncoding("utf8").on("data", prefix(name, process.stdout));
        child.stderr.setEncoding("utf8").on("data", prefix(name, process.stderr));
        child.on("close", resolve);
      }),
  ),
);

process.exit(codes.some((code) => code !== 0) ? 1 : 0);
