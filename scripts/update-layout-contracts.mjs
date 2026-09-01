import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseDgm } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram } from "../packages/runtime/dist/render/index.js";
import { compiledGeometry } from "./lib/compiled-geometry.mjs";
import { repoRoot } from "./lib/example-manifest.mjs";

const root = repoRoot();
const contractsPath = resolve(root, "examples/layout-contracts.json");
const contracts = JSON.parse(readFileSync(contractsPath, "utf8"));

for (const [id, contract] of Object.entries(contracts.examples ?? {})) {
  const result = compileDiagram(parseDgm(readFileSync(resolve(root, contract.diagram), "utf8")));
  if (!result.ok) throw new Error(`${id} failed to compile: ${result.issues.map((issue) => issue.message).join("; ")}`);
  contract.geometry = compiledGeometry(result.layout);
}

writeFileSync(contractsPath, `${JSON.stringify(contracts, null, 2)}\n`);
console.log(`Updated compiled geometry for ${Object.keys(contracts.examples).length} curated examples.`);
