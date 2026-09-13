import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { parseDgm } from '@dumb-diagrams/runtime/dsl';
import { compileDiagram, inlineCatalogIcons, qualityFindings, assessQuality } from '@dumb-diagrams/runtime/render';
import { getCatalogEntryByBrowserPath } from '@dumb-diagrams/runtime/catalog';

const root = new URL('../../../', import.meta.url);
const site = new URL('../', import.meta.url);
const input = new URL('src/examples/mechanics/', site);
const output = new URL('public/docs-explainers/', site);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const diagrams = {};
for (const filename of (await readdir(input)).filter(name => name.endsWith('.dgm')).sort()) {
  const id = filename.slice(0, -4);
  const source = await readFile(new URL(filename, input), 'utf8');
  const result = compileDiagram(parseDgm(source));
  if (!result.ok) throw new Error(`${filename}: ${JSON.stringify(result.issues)}`);
  const svg = await inlineCatalogIcons(result.svg, {
    loadCatalogSvg: async path => {
      const entry = getCatalogEntryByBrowserPath(path);
      if (!entry) throw new Error(`Missing catalog entry: ${path}`);
      return readFile(new URL(entry.iconPath, root), 'utf8');
    },
  });
  const findings = qualityFindings(result.issues, result.invariantFailures);
  await writeFile(new URL(`${id}.dgm`, output), source);
  await writeFile(new URL(`${id}.svg`, output), svg);
  diagrams[id] = {
    provenance: 'runtime-compiled',
    sourceHref: `docs-explainers/${id}.dgm`,
    svgHref: `docs-explainers/${id}.svg`,
    issues: result.issues.map(issue => ({ level: issue.level, code: issue.code, message: issue.message })),
    invariants: result.invariantFailures,
    quality: assessQuality(findings),
  };
}

await writeFile(new URL('manifest.json', output), `${JSON.stringify({ schemaVersion: 1, diagrams }, null, 2)}\n`);
console.log(`Prepared ${Object.keys(diagrams).length} docs explainer diagram`);
