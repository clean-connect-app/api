import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";
import projectRules from "./scripts/eslint-project-rules.mjs";

const typedFiles = ["src/**/*.{ts,tsx}", "tests/**/*.ts", "vite.config.mts"];

export default defineConfig(
  globalIgnores([
    "node_modules/",
    "dist/",
    ".test-build/",
    ".npm-cache/",
    "coverage/",
    "var/",
  ]),
  {
    files: ["**/*.{mjs,ts,tsx,mts}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { curly: ["error", "all"] },
  },
  {
    files: typedFiles,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.server.json", "./tsconfig.tests.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { project: projectRules },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "interface", format: ["PascalCase"], prefix: ["I"] },
        { selector: "typeAlias", format: ["PascalCase"], prefix: ["T"] },
      ],
      "project/types-location": "error",
    },
  },
  {
    files: ["src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/client", "**/client/**"],
              message: "Серверный код не должен зависеть от клиентского кода.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/client",
                "**/client/**",
                "**/server",
                "**/server/**",
                "node:*",
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "@nestjs/*",
              ],
              message:
                "Общий код должен работать независимо от клиента и сервера.",
            },
          ],
        },
      ],
    },
  },
  prettier,
  { rules: { curly: ["error", "all"] } },
);
