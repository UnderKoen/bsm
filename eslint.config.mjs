import globals from "globals";
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config([
  {
    ignores: ["node_modules", "dist"],
  },
  eslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.commonjs,
        ...globals.node,
      },
    },
    rules: {
      "quote-props": ["error", "as-needed"],
    },
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-throw-literal": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
]);
