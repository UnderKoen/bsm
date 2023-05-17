module.exports = {
  extends: ["./test.js"],
  scripts: {
    prettier: {
      _default: "bsm ~.*",
      packageJson: "prettier-package-json --write",
      eslint: "eslint --fix .",
      prettier: "prettier --write .",
    },
    lint: {
      _default: "bsm ~.*",
      eslint: "eslint .",
      prettier: "prettier --check .",
    },
  },
};
