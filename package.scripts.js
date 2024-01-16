module.exports = {
  extends: ["./test"],
  scripts: {
    build: {
      $description: "Build the project, has options for prod, dev, and watch",
      _default: {
        _pre: "rimraf ./dist",
        _default: "node esbuild.config.js",
      },
      prod: {
        //TODO single line $env
        $env: {
          PROD: "TRUE",
        },
        _default: "bsm build",
      },
      //TODO
      watch: "bsm ~ -- --watch",
    },
    prettier: {
      $description: "Run all formatters",
      _default: "bsm ~.*",
      packageJson: "prettier-package-json --write",
      eslint: "bsm lint.eslint -- --fix",
      prettier: "prettier --write .",
      updateBsm: [
        "npm i -D @under_koen/bsm@latest",
        "npm up @under_koen/bsm --save",
      ],
    },
    lint: {
      $description: "Run all linters",
      _default: "bsm ~.*",
      typescript: "tsc --noEmit",
      eslint: "eslint --ext .ts,.js .",
      prettier: "prettier --check .",
    },
    test: {
      $env: {
        TEST: "TRUE",
        NODE_ENV: "test",
      },
      _pre: "bsm build",
      _default: "uvu -r tsm test -i fixtures",
      cov: "c8 bsm ~ --",
    },
    env: () => {
      console.log(process.env);
    },
  },
  config: {
    defaultHelpBehavior: "interactive",
  },
};
