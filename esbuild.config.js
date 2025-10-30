import esbuild from "esbuild";

const prod = process.env.PROD === "TRUE";

esbuild.build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node16",
  outfile: "dist/index.js",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  minify: prod,
  sourcemap: !prod,
  format: "esm",
  external: ["@inquirer/core"],
});
