module.exports = {
  extends: ["./test.js"],
  scripts: {
    build: {
      _default: {
        _pre: "rimraf ./dist",
        _default:
          "esbuild src/index.ts --bundle --platform=node --target=node16 --outfile=dist/index.js",
      },
      prod: "bsm ~ -- --minify",
      dev: "bsm ~ -- --sourcemap",
      watch: "bsm ~.dev -- --watch",
    },
    prettier: {
      _default: "bsm ~.*",
      packageJson: "prettier-package-json --write",
      eslint: "bsm lint.eslint -- --fix",
      prettier: "prettier --write .",
    },
    lint: {
      _default: "bsm ~.*",
      eslint: "eslint --ext .ts,.js .",
      prettier: "prettier --check .",
    },
  },
};
