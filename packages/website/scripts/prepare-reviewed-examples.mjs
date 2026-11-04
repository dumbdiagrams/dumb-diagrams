import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const archive = resolve(root, 'examples/reviewed');
const output = resolve(root, 'packages/website/public/reviewed-examples');
const manifest = JSON.parse(await readFile(resolve(archive, 'manifest.json'), 'utf8'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const publicManifest = manifest.examples.map(record => {
  const files = {};
  for (const key of ['svg', 'source', 'prompt']) {
    const name = basename(record[key]);
    files[key] = name;
  }
  return { ...record, files };
});
await Promise.all(manifest.examples.flatMap(record => ['svg', 'source', 'prompt'].map(key =>
  copyFile(resolve(root, record[key]), resolve(output, basename(record[key]))),
)));
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ formatVersion: manifest.formatVersion, examples: publicManifest }, null, 2) + '\n');
console.log(`Prepared ${publicManifest.length} original reviewed exports in ${output}`);

