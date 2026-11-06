import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatParseError, parseDgmResult } from '@dumb-diagrams/runtime/dsl';
import { checkRequirements, parseRequirements } from '@dumb-diagrams/runtime/requirements';
import { compileDiagram, inlineCatalogIcons } from '@dumb-diagrams/runtime/render';

import { loadReviewedExamples } from '../src/lib/reviewed-examples.mjs';
import { loadCatalogSvg } from './catalog-loader.mjs';
import { cropSvgToLayout } from '../src/lib/preview-crop.mjs';

const output = resolve(fileURLToPath(new URL('../public/reviewed-examples', import.meta.url)));
const examples = loadReviewedExamples();
await rm(output, { recursive: true, force: true });
await Promise.all([...new Set(examples.map(example => example.run))].map(run => mkdir(resolve(output, run), { recursive: true })));
await Promise.all(examples.map(async example => {
  const parsed = parseDgmResult(await readFile(example.paths.source, 'utf8'));
  if (parsed.isErr()) throw new Error(`${example.run}/${example.id}: ${formatParseError(parsed.error)}`);
  const requirements = parseRequirements(await readFile(example.paths.requirements, 'utf8'));
  if (requirements.isErr()) throw new Error(`${example.run}/${example.id}: ${requirements.error.message}`);
  const issues = checkRequirements(parsed.value, requirements.value);
  if (issues.length) throw new Error(`${example.run}/${example.id}: requirements are incomplete: ${JSON.stringify(issues)}`);
  const result = compileDiagram(parsed.value);
  if (!result.ok) throw new Error(`${example.run}/${example.id}: ${JSON.stringify(result.issues)}`);
  const inlined = await inlineCatalogIcons(result.svg, { loadCatalogSvg });
  if (inlined.isErr()) throw new Error(`${example.run}/${example.id}: ${inlined.error.message}`);
  const preview = cropSvgToLayout(inlined.value, result.layout);
  await Promise.all([
    ...Object.keys(example.files).map(key => copyFile(example.paths[key], resolve(output, example.files[key]))),
    writeFile(resolve(output, example.files.svg.replace(/\.svg$/, '-preview.svg')), preview.svg),
  ]);
}));
const publicManifest = examples.map(({ paths: _paths, promptText: _promptText, previewWidth: _previewWidth, previewHeight: _previewHeight, ...record }) => record);
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ formatVersion: 2, examples: publicManifest }, null, 2) + '\n');
console.log(`Prepared ${publicManifest.length} approved examples in ${output}`);
