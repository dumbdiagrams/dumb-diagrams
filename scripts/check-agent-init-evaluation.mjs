#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileDiagram } from "../packages/runtime/dist/render/index.js";
import { parseDgm } from "../packages/runtime/dist/dsl/index.js";
import { getCatalogEntry, listAssets } from "../packages/runtime/dist/catalog/index.js";

const DEFAULT_ROOT = resolve(
  fileURLToPath(new URL("../examples/evaluations/simple-serverless-web-application/", import.meta.url)),
);
const CURATED_ROOT = resolve(fileURLToPath(new URL("../examples/curated/", import.meta.url)));
const CURATED_CONTRACT = resolve(fileURLToPath(new URL("../examples/evaluations/curated-aws.json", import.meta.url)));
const canonicalTypeByIcon = new Map(
  listAssets("all").map((entry) => [entry.icon.sourceId, entry.type]),
);
const LEVELS = {
  vague: { prompt: "vague.md", source: "vague.dgm" },
  normal: { prompt: "normal.md", source: "normal.dgm" },
  detailed: { prompt: "detailed.md", source: "detailed.dgm" },
  expert: {
    prompt: "../../curated/simple-serverless-web-application/reference-spec.md",
    source: "../../curated/simple-serverless-web-application/diagram.dgm",
  },
};

/**
 * Compare a generated source with a semantic contract. IDs, labels, ordering,
 * and formatting are deliberately ignored; catalog types and edge direction
 * are the stable architectural identity used by this check.
 */
export function evaluateSource(source, expected) {
  let doc;
  try {
    doc = parseDgm(source);
  } catch (error) {
    return failure(`parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const compiled = compileDiagram(doc);
  if (!compiled.ok) {
    return failure("full compile failed", {
      issues: compiled.issues,
    });
  }

  const failures = [];
  if (expected.grammar && doc.grammar !== expected.grammar) {
    failures.push(`grammar is ${doc.grammar}, expected ${expected.grammar}`);
  }

  for (const item of [...doc.resources, ...doc.groups.filter((group) => group.type)]) {
    const entry = getCatalogEntry(item.type);
    if (entry && entry.provider !== "cloud-agnostic" && entry.provider !== doc.grammar) {
      failures.push(`provider mismatch: ${item.type} is ${entry.provider}, diagram grammar is ${doc.grammar}`);
    }
  }

  const counts = countTypes(doc.resources);
  const groupCounts = countTypes(doc.groups.map((group) => ({ type: group.type ?? group.kind })));
  for (const [type, count] of Object.entries(expected.exactCounts ?? {})) {
    if ((counts.get(type) ?? 0) !== count) {
      failures.push(`exact count for ${type}: got ${counts.get(type) ?? 0}, expected ${count}`);
    }
  }
  for (const [type, count] of Object.entries(expected.minimumCounts ?? {})) {
    if ((counts.get(type) ?? 0) < count) {
      failures.push(`minimum count for ${type}: got ${counts.get(type) ?? 0}, expected at least ${count}`);
    }
  }
  for (const [type, count] of Object.entries(expected.exactGroupCounts ?? {})) {
    if ((groupCounts.get(type) ?? 0) !== count) {
      failures.push(`exact group count for ${type}: got ${groupCounts.get(type) ?? 0}, expected ${count}`);
    }
  }
  if (expected.noUnexpectedGroupTypes) {
    const allowed = new Set(Object.keys(expected.exactGroupCounts ?? {}));
    for (const type of groupCounts.keys()) {
      if (!allowed.has(type)) failures.push(`unexpected group type: ${type}`);
    }
  }
  if (expected.noUnexpectedTypes) {
    const allowed = new Set([
      ...Object.keys(expected.exactCounts ?? {}),
      ...Object.keys(expected.minimumCounts ?? {}),
    ]);
    for (const type of counts.keys()) {
      if (!allowed.has(type)) failures.push(`unexpected resource type: ${type}`);
    }
  }
  for (const type of expected.forbiddenTypes ?? []) {
    if ((counts.get(type) ?? 0) > 0) failures.push(`forbidden resource type present: ${type}`);
  }

  const byId = new Map([
    ...doc.resources.map((resource) => [resource.id, resource]),
    ...doc.groups.map((group) => [group.id, group]),
  ]);
  const groupsById = new Map(doc.groups.map((group) => [group.id, group]));
  const typeById = new Map([
    ...doc.resources.map((resource) => [resource.id, canonicalType(resource.type)]),
    ...doc.groups.map((group) => [group.id, canonicalType(group.type ?? group.kind)]),
  ]);
  const ancestorTypes = (id) => {
    const result = [];
    const seen = new Set();
    let current = byId.get(id);
    while (current?.parent && !seen.has(current.parent)) {
      seen.add(current.parent);
      const parent = groupsById.get(current.parent);
      if (!parent) break;
      result.push(canonicalType(parent.type ?? parent.kind));
      current = parent;
    }
    return result;
  };

  for (const requirement of expected.containment ?? []) {
    const matching = doc.resources.filter((resource) => canonicalType(resource.type) === requirement.childType);
    if (!matching.length) continue;
    for (const resource of matching) {
      if (!ancestorTypes(resource.id).includes(requirement.ancestorType)) {
        failures.push(`${canonicalType(resource.type)} (${resource.id}) is not inside ${requirement.ancestorType}`);
      }
    }
  }
  for (const requirement of expected.groupContainment ?? []) {
    const matching = doc.groups.filter((group) => canonicalType(group.type ?? group.kind) === requirement.childGroupType);
    if (!matching.length) {
      failures.push(`group type missing: ${requirement.childGroupType}`);
      continue;
    }
    for (const group of matching) {
      if (!ancestorTypes(group.id).includes(requirement.ancestorType)) {
        failures.push(`${requirement.childGroupType} (${group.id}) is not inside ${requirement.ancestorType}`);
      }
    }
  }
  for (const requirement of expected.outsideContainment ?? []) {
    const matching = doc.resources.filter((resource) => canonicalType(resource.type) === requirement.childType);
    if (!matching.length) continue;
    for (const resource of matching) {
      if (ancestorTypes(resource.id).includes(requirement.ancestorType)) {
        failures.push(`${canonicalType(resource.type)} (${resource.id}) must be outside ${requirement.ancestorType}`);
      }
    }
  }

  const relationships = new Map();
  for (const edge of doc.edges) {
    const key = `${typeById.get(edge.source)} -> ${typeById.get(edge.target)}`;
    relationships.set(key, (relationships.get(key) ?? 0) + 1);
  }
  for (const relationship of expected.relationships ?? []) {
    const key = `${relationship.sourceType} -> ${relationship.targetType}`;
    const expectedCount = relationship.count ?? 1;
    const actualCount = relationships.get(key) ?? 0;
    if (actualCount !== expectedCount) failures.push(`directed relationship ${key}: got ${actualCount}, expected ${expectedCount}`);
  }
  if (expected.relationshipMode === "exact") {
    const allowed = new Set((expected.relationships ?? []).map(
      (relationship) => `${relationship.sourceType} -> ${relationship.targetType}`,
    ));
    for (const relationship of relationships.keys()) {
      if (!allowed.has(relationship)) failures.push(`unexpected directed relationship: ${relationship}`);
    }
  }

  const allowedValidationWarnings = new Set(expected.allowedValidationWarnings ?? []);
  for (const issue of compiled.issues) {
    if (issue.level === "error" || !allowedValidationWarnings.has(issue.code)) {
      failures.push(`validation ${issue.level}: ${issue.code}`);
    }
  }

  return failures.length
    ? failure(failures.join("; "), { counts: Object.fromEntries(counts) })
    : {
      ok: true,
      grammar: doc.grammar,
      providerValid: true,
      counts: Object.fromEntries(counts),
      groupCounts: Object.fromEntries(groupCounts),
      warningCodes: compiled.invariantFailures.map((warning) => warning.code),
    };
}

function countTypes(resources) {
  const counts = new Map();
  for (const resource of resources) {
    const type = canonicalType(resource.type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}

function canonicalType(type) {
  const entry = getCatalogEntry(type);
  return entry ? (canonicalTypeByIcon.get(entry.icon.sourceId) ?? type) : type;
}

function failure(message, details = {}) {
  return { ok: false, message, ...details };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateCuratedBundle(root, contract) {
  const failures = [];
  const results = {};
  const requiredFiles = ["user-prompt.md", "architecture-brief.md", "reference-spec.md", "diagram.dgm"];
  if (!contract || contract.version !== 1 || !contract.examples || typeof contract.examples !== "object") {
    return failure("curated contract must have version 1 and an examples object");
  }

  for (const [id, expected] of Object.entries(contract.examples)) {
    const exampleRoot = resolve(root, id);
    const exampleFailures = [];
    const files = {};
    for (const file of requiredFiles) {
      const path = resolve(exampleRoot, file);
      if (!existsSync(path)) {
        const message = `missing ${file}`;
        exampleFailures.push(message);
        failures.push(`${id}: ${message}`);
      } else if (readFileSync(path, "utf8").trim().length === 0) {
        const message = `empty ${file}`;
        exampleFailures.push(message);
        failures.push(`${id}: ${message}`);
      } else {
        files[file] = true;
      }
    }
    const sourcePath = resolve(exampleRoot, "diagram.dgm");
    if (existsSync(sourcePath)) {
      const result = evaluateSource(readFileSync(sourcePath, "utf8"), {
        grammar: "aws",
        noUnexpectedTypes: true,
        noUnexpectedGroupTypes: true,
        ...expected,
      });
      if (!result.ok) {
        exampleFailures.push(result.message);
        failures.push(`${id}: ${result.message}`);
      }
      results[id] = { ok: exampleFailures.length === 0, files, semantic: result };
    } else {
      results[id] = { ok: false, files, semantic: failure("missing diagram.dgm") };
    }
  }

  return failures.length ? { ok: false, message: failures.join("; "), examples: results } : { ok: true, examples: results };
}

function run(root) {
  const expectedPath = resolve(root, "expected.json");
  const expected = readJson(expectedPath);
  const results = {};
  let ok = true;

  for (const [level, files] of Object.entries(LEVELS)) {
    const sourcePath = resolve(root, files.source);
    const promptPath = resolve(root, files.prompt);
    if (!existsSync(sourcePath) || !existsSync(promptPath)) {
      results[level] = failure("missing prompt or candidate source");
      ok = false;
      continue;
    }
    results[level] = evaluateSource(readFileSync(sourcePath, "utf8"), expected);
    if (!results[level].ok) ok = false;
  }

  // A deliberately impossible requirement proves that a semantic violation
  // fails the evaluator, rather than the fixture passing vacuously.
  const negativeExpected = {
    ...expected,
    exactCounts: { ...expected.exactCounts, "aws.kinesis": 1 },
  };
  const negative = evaluateSource(
    readFileSync(resolve(root, "normal.dgm"), "utf8"),
    negativeExpected,
  );
  results.negativeSelfTest = { ok: !negative.ok, observed: negative.message };
  if (negative.ok) ok = false;

  const curatedContract = readJson(CURATED_CONTRACT);
  const curated = validateCuratedBundle(CURATED_ROOT, curatedContract);
  results.curated = curated;
  if (!curated.ok) ok = false;

  console.log(JSON.stringify({ ok, root, results }, null, 2));
  return ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const rootArg = process.argv[2];
  process.exitCode = run(rootArg ? (isAbsolute(rootArg) ? rootArg : resolve(process.cwd(), rootArg)) : DEFAULT_ROOT);
}
