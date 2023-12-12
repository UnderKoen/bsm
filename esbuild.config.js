const prod = process.env.PROD === "TRUE";

require("esbuild").build({
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
});
