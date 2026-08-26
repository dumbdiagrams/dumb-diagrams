import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ASSETS = [
  {
    path: "packages/editor/public/logo_dumbdiagrams.png",
    maxBytes: 8_192,
    width: 128,
    height: 77,
  },
  {
    path: "packages/editor/public/favicon.png",
    maxBytes: 4_096,
    width: 48,
    height: 48,
  },
];

const failures = [];
for (const asset of ASSETS) {
  const path = resolve(asset.path);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    failures.push(`${asset.path}: file is missing`);
    continue;
  }

  const size = statSync(path).size;
  if (
    bytes.length < 24 ||
    bytes.readUInt32BE(0) !== 0x89504e47 ||
    bytes.readUInt32BE(4) !== 0x0d0a1a0a
  ) {
    failures.push(`${asset.path}: file is not a readable PNG`);
    continue;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (size > asset.maxBytes) {
    failures.push(`${asset.path}: ${size} bytes exceeds the ${asset.maxBytes}-byte budget`);
  }
  if (width !== asset.width || height !== asset.height) {
    failures.push(`${asset.path}: expected ${asset.width}x${asset.height}, found ${width}x${height}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Editor branding assets are within their size and dimension budgets");
}
