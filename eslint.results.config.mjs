import parser from "@typescript-eslint/parser";
import neverthrow from "@ninoseki/eslint-plugin-neverthrow";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// Biome owns general linting. ESLint enforces typed Result boundaries.
export default [
  { ignores: ["**/*.test.*", "**/dist/**", "**/catalog/generated/**"] },
  ...["runtime", "editor", "cli"].map((name) => ({
    files: [`packages/${name}/src/**/*.{ts,tsx}`],
    languageOptions: {
      parser,
      parserOptions: { project: `packages/${name}/tsconfig.json`, tsconfigRootDir: root },
    },
    plugins: { neverthrow },
    rules: {
      "neverthrow/must-use-result": "error",
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[property.name=/^_unsafeUnwrap(Err)?$/]",
        message: "Handle or propagate the Result instead of unwrapping it unsafely.",
      }, ...(name === "editor" ? [] : [{
        selector: "ThrowStatement",
        message: "Return Result/ResultAsync for failures; adapt platform exceptions at their boundary.",
      }])],
    },
  })),
];
