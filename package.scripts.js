module.exports = {
  extends: ["./test"],
  scripts: {
    build: {
      $description: "Build the project, has options for prod, dev, and watch",
      _default: {
        _pre: "rimraf ./dist",
        _default:
          "esbuild src/index.ts --bundle --platform=node --target=node16 --outfile=dist/index.js",
      },
      prod: "bsm \\~ -- --minify",
      dev: "bsm \\~ -- --sourcemap",
      watch: "bsm ~.dev -- --watch",
    },
    prettier: {
      $description: "Run all formatters",
      _default: "bsm ~.*",
      packageJson: "prettier-package-json --write",
      eslint: "bsm lint.eslint -- --fix",
      prettier: "prettier --write .",
    },
    lint: {
      $description: "Run all linters",
      _default: "bsm ~.*",
      eslint: "eslint --ext .ts,.js .",
      prettier: "prettier --check .",
    },
    test: {
      _default: "uvu -r tsm test",
      cov: "c8 bsm \\~",
    },
  },
};
