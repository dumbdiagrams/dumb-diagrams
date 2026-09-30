import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ overrideConfigFile: resolve("eslint.results.config.mjs") });
const filePath = resolve("packages/editor/src/state/document-actions.ts");

async function messages(source: string) {
  const results = await eslint.lintText(source, { filePath });
  return results.flatMap((result) => result.messages.map((message) => message.ruleId));
}

describe("Result consumption enforcement", () => {
  it("rejects ignored synchronous and awaited results", async () => {
    expect(await messages('import { ok } from "neverthrow"; ok(1);')).toContain("neverthrow/must-use-result");
    expect(await messages('import { okAsync } from "neverthrow"; export async function run() { await okAsync(1); }'))
      .toContain("neverthrow/must-use-result");
  });
  it("accepts explicit handling and propagation", async () => {
    expect(await messages('import { ok } from "neverthrow"; const result = ok(1); if (result.isErr()) console.error(result.error); else console.log(result.value);'))
      .toEqual([]);
    expect(await messages('import { ok } from "neverthrow"; export function run() { return ok(1); }')).toEqual([]);
  });
  it("rejects unsafe production unwraps", async () => {
    expect(await messages('import { ok } from "neverthrow"; ok(1)._unsafeUnwrap();')).toContain("no-restricted-syntax");
  });
});
