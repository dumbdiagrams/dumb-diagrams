import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { formatParseError, parseDgmResult } from '@dumb-diagrams/runtime/dsl';
import { checkRequirements, parseRequirements } from '@dumb-diagrams/runtime/requirements';
import { compileDiagram } from '@dumb-diagrams/runtime/render';

const source = new URL('../src/examples/engineering-drawing-extraction/', import.meta.url);
const output = new URL('../public/worked-examples/engineering-drawing-extraction/', import.meta.url);
const parsed = parseDgmResult(await readFile(new URL('diagram.dgm', source), 'utf8'));
if (parsed.isErr()) throw new Error(formatParseError(parsed.error));
const requirements = parseRequirements(await readFile(new URL('diagram.requirements.json', source), 'utf8'));
if (requirements.isErr()) throw new Error(requirements.error.message);
const issues = checkRequirements(parsed.value, requirements.value);
if (issues.length) throw new Error(`Engineering drawing example: ${JSON.stringify(issues)}`);
const compiled = compileDiagram(parsed.value);
if (!compiled.ok) throw new Error(`Engineering drawing example: ${JSON.stringify(compiled.issues)}`);

// Preserve the reviewed export, including the author's Studio label adjustments.
// Compilation checks that its companion source still opens in the current engine.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(['diagram.svg', 'diagram.dgm', 'diagram.requirements.json', 'prompt.txt'].map(file =>
  copyFile(new URL(file, source), new URL(file, output)),
));
