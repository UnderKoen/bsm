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
        ecmaVersion: "latest",
        sourceType: "script",
        project: "./tsconfig.json",
      },
      plugins: ["@typescript-eslint"],
      parser: "@typescript-eslint/parser",
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "plugin:@typescript-eslint/strict",
      ],
      rules: {
        "@typescript-eslint/no-throw-literal": "off",
      },
    },
  ],
  rules: {
    "quote-props": ["error", "as-needed"],
  },
  ignorePatterns: ["node_modules", "dist"],
};
