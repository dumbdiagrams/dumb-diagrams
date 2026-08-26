import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDgm } from '@dumb-diagrams/runtime/dsl';
import { compileDiagram, inlineCatalogIcons } from '@dumb-diagrams/runtime/render';
import { getCatalogEntryByBrowserPath } from '@dumb-diagrams/runtime/catalog';

const root = new URL('../../../', import.meta.url);
const site = new URL('../', import.meta.url);
await mkdir(new URL('public/diagrams/', site), { recursive: true });
for (const filename of await readdir(new URL('src/examples/', site))) {
  if (!filename.endsWith('.dgm')) continue;
  const source = await readFile(new URL(`src/examples/${filename}`, site), 'utf8');
  const result = compileDiagram(parseDgm(source));
  if (!result.ok) throw new Error(`${filename}: ${JSON.stringify(result.issues)}`);
  const svg = await inlineCatalogIcons(result.svg, {
    loadCatalogSvg: async (path) => {
      const entry = getCatalogEntryByBrowserPath(path);
      if (!entry) throw new Error(`Missing catalog entry: ${path}`);
      return readFile(new URL(entry.iconPath, root), 'utf8');
    },
  });
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
}
await copyFile(new URL('packages/editor/public/logo_dumbdiagrams.png', root), new URL('public/logo.png', site));
await copyFile(new URL('packages/editor/public/favicon.png', root), new URL('public/favicon.png', site));
await copyFile(new URL('LICENSE', root), new URL('public/LICENSE.txt', site));
await copyFile(new URL('ICON-NOTICES.md', root), new URL('public/ICON-NOTICES.txt', site));
const fontNotices = await Promise.all([
  ['Manrope', '@fontsource-variable/manrope'],
  ['IBM Plex Mono', '@fontsource/ibm-plex-mono'],
].map(async ([name, packageName]) => `${name}\n${await readFile(new URL(`node_modules/${packageName}/LICENSE`, site), 'utf8')}`));
await writeFile(new URL('public/FONT-LICENSES.txt', site), fontNotices.join('\n\n---\n\n'));
console.log(`Prepared real engine-rendered examples in ${fileURLToPath(new URL('public/', site))}`);
