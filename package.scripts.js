module.exports = {
  scripts: {
    prettier: {
      _default: "bsm prettier.*",
      packageJson: "prettier-package-json --write",
      eslint: "eslint --fix .",
      prettier: "prettier --write .",
    },
    lint: {
      _default: "bsm lint.*",
      eslint: "eslint .",
      prettier: "prettier --check .",
    },
    os: {
      _win32: "echo Windows",
      _default: `echo Not Windows`,
    },
    args: {
      _default: "bsm args.* --",
      echo: "echo",
    }
  },
};
