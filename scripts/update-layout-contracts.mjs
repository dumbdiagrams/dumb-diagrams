import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatParseError, parseDgmResult } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram } from "../packages/runtime/dist/render/index.js";
import { compiledGeometry } from "./lib/compiled-geometry.mjs";
import { repoRoot } from "./lib/example-manifest.mjs";

const root = repoRoot();
const contractsPath = resolve(root, "examples/layout-contracts.json");
const contracts = JSON.parse(readFileSync(contractsPath, "utf8"));

for (const [id, contract] of Object.entries(contracts.examples ?? {})) {
  const parsed = parseDgmResult(readFileSync(resolve(root, contract.diagram), "utf8"));
  if (parsed.isErr()) {
    console.error(`${id} failed to parse: ${formatParseError(parsed.error)}`);
    process.exit(1);
  }
  const result = compileDiagram(parsed.value);
  if (!result.ok) {
    console.error(`${id} failed to compile: ${result.issues.map((issue) => issue.message).join("; ")}`);
    process.exit(1);
  }
  contract.geometry = compiledGeometry(result.layout);
}

writeFileSync(contractsPath, `${JSON.stringify(contracts, null, 2)}\n`);
console.log(`Updated compiled geometry for ${Object.keys(contracts.examples).length} curated examples.`);
