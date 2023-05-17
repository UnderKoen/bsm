module.exports = {
  extends: ["eslint:recommended", "prettier"],
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  overrides: [
    {
      files: ["./src/**/*"],
      parserOptions: {
        sourceType: "script",
        project: "./tsconfig.json",
      },
      extends: ["plugin:@typescript-eslint/strict"],
      rules: {
        "@typescript-eslint/no-throw-literal": "off",
      },
    },
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    "quote-props": ["error", "as-needed"],
  },
  ignorePatterns: ["node_modules", "dist"],
};
