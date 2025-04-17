import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import { parser as tsParser, configs as tsConfigs } from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import importPlugin from "eslint-plugin-import";
import svelte from "eslint-plugin-svelte";
import svelteConfig from "./svelte.config.js";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,svelte}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  tsConfigs.recommended,
  ...svelte.configs.recommended,
  ...svelte.configs.prettier,
  {
    files: ["**/*.svelte", "**/*.svelte.{js,ts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: tsParser,
        svelteConfig,
      },
    },
  },
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
      "import/parsers": {
        "@typescript-eslint/parser": [".js", ".mjs", ".cjs", ".ts", ".tsx"],
      },
    },
  },
  eslintConfigPrettier,
]);
