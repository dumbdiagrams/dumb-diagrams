import { readFile, writeFile, mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDgmResult, formatParseError } from '@dumb-diagrams/runtime/dsl';
import { checkRequirements, parseRequirements } from '@dumb-diagrams/runtime/requirements';
import { compileDiagram, inlineCatalogIcons } from '@dumb-diagrams/runtime/render';
import { loadCatalogSvg } from './catalog-loader.mjs';
import { loadExamples } from '../src/lib/examples.mjs';
import './prepare-reviewed-examples.mjs';

const root = new URL('../../../', import.meta.url);
const site = new URL('../', import.meta.url);
// This directory contains only build outputs, never authored diagrams.
await rm(new URL('public/diagrams/', site), { recursive: true, force: true });
await mkdir(new URL('public/diagrams/', site), { recursive: true });
const examples = loadExamples();
for (const filename of await readdir(new URL('src/examples/', site))) {
  if (filename.endsWith('.dgm')) examples.push({ id: filename.slice(0, -4), source: await readFile(new URL(`src/examples/${filename}`, site), 'utf8') });
}
for (const { id, source, prompt, referenceSpec, requirements } of examples) {
  const filename = `${id}.dgm`;
  const parsed = parseDgmResult(source);
  if (parsed.isErr()) {
    console.error(`${filename}: ${formatParseError(parsed.error)}`);
    process.exit(1);
  }
  let requirementsText = requirements;
  if (!requirementsText) {
    requirementsText = await readFile(new URL(`src/examples/${id}.requirements.json`, site), 'utf8');
  }
  const requirementsResult = parseRequirements(requirementsText);
  if (requirementsResult.isErr()) {
    console.error(`${id}.requirements.json: ${requirementsResult.error.message}`);
    process.exit(1);
  }
  const requirementIssues = checkRequirements(parsed.value, requirementsResult.value);
  if (requirementIssues.length) {
    console.error(`${filename}: requirements are incomplete: ${JSON.stringify(requirementIssues)}`);
    process.exit(1);
  }
  const result = compileDiagram(parsed.value);
  if (!result.ok) {
    console.error(`${filename}: ${JSON.stringify(result.issues)}`);
    process.exit(1);
  }
  const inlined = await inlineCatalogIcons(result.svg, {
    loadCatalogSvg,
  });
  if (inlined.isErr()) {
    console.error(`${filename}: ${inlined.error.message}`);
    process.exit(1);
  }
  const svg = inlined.value;
  await writeFile(new URL(`public/diagrams/${filename.replace('.dgm', '.svg')}`, site), svg);
  // Fit the website preview to authored content; keep the downloadable engine
  // export intact. No resource or connector geometry is changed.
  const rects = [
    ...result.layout.nodes.map(node => node.obstacle),
    ...result.layout.groups.map(group => group.bounds),
    ...result.layout.edges.flatMap(edge => [
      ...edge.points.map(point => ({ ...point, w: 0, h: 0 })),
      ...(edge.badge ? [{ x: edge.badge.x - 12, y: edge.badge.y - 12, w: 24, h: 24 }] : []),
    ]),
  ];
  const x = Math.floor(Math.min(...rects.map(rect => rect.x)) - 24);
  const y = Math.floor(Math.min(...rects.map(rect => rect.y)) - 24);
  const width = Math.ceil(Math.max(...rects.map(rect => rect.x + rect.w)) - x + 24);
  const height = Math.ceil(Math.max(...rects.map(rect => rect.y + rect.h)) - y + 24);
  const preview = svg.replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">`);
  await writeFile(new URL(`public/diagrams/${filename.replace('.dgm', '-preview.svg')}`, site), preview);
  await writeFile(new URL(`public/diagrams/${filename}`, site), source);
  await writeFile(new URL(`public/diagrams/${id}.requirements.json`, site), requirementsText);
  if (prompt) await writeFile(new URL(`public/diagrams/${id}-prompt.txt`, site), prompt);
  if (referenceSpec) await writeFile(new URL(`public/diagrams/${id}-reference-spec.md`, site), referenceSpec);
}
await copyFile(new URL('packages/editor/public/logo_dumbdiagrams.png', root), new URL('public/logo.png', site));
await copyFile(new URL('packages/editor/public/favicon.png', root), new URL('public/favicon.png', site));
await copyFile(new URL('LICENSE', root), new URL('public/LICENSE.txt', site));
await copyFile(new URL('ICON-NOTICES.md', root), new URL('public/ICON-NOTICES.txt', site));
await copyFile(new URL('packages/brand/FONT-LICENSES.txt', root), new URL('public/FONT-LICENSES.txt', site));
console.log(`Prepared real engine-rendered examples in ${fileURLToPath(new URL('public/', site))}`);
