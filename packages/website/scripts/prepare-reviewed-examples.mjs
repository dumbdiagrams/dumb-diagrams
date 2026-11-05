import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDgmResult, formatParseError } from '@dumb-diagrams/runtime/dsl';
import { checkRequirements, parseRequirements } from '@dumb-diagrams/runtime/requirements';

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
  files.requirements = `${files.source.replace(/\.dgm$/, '')}.requirements.json`;
  return { ...record, files };
});
await Promise.all(manifest.examples.flatMap(record => {
  const requirements = record.source.replace(/\.dgm$/, '.requirements.json');
  const source = readFile(resolve(root, record.source), 'utf8');
  const contract = readFile(resolve(root, requirements), 'utf8');
  return [
    ...['svg', 'source', 'prompt'].map(key => copyFile(resolve(root, record[key]), resolve(output, basename(record[key])))),
    (async () => {
      const [sourceText, requirementsText] = await Promise.all([source, contract]);
      const parsed = parseDgmResult(sourceText);
      if (parsed.isErr()) throw new Error(`${record.source}: ${formatParseError(parsed.error)}`);
      const parsedRequirements = parseRequirements(requirementsText);
      if (parsedRequirements.isErr()) throw new Error(`${requirements}: ${parsedRequirements.error.message}`);
      const issues = checkRequirements(parsed.value, parsedRequirements.value);
      if (issues.length) throw new Error(`${record.source}: requirements are incomplete: ${JSON.stringify(issues)}`);
      await writeFile(resolve(output, basename(requirements)), requirementsText);
    })(),
  ];
}));
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ formatVersion: manifest.formatVersion, examples: publicManifest }, null, 2) + '\n');
console.log(`Prepared ${publicManifest.length} original reviewed exports in ${output}`);

