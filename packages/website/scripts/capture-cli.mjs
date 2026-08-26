import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';

const site = new URL('../', import.meta.url);
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'dumb-diagrams-website-')));
try {
  // Run our local CLI, not npm: builds never install or execute a remote package.
  // A positional name uses the CLI's real noninteractive creation flow.
  const env = { ...process.env, FORCE_COLOR: '3', COLUMNS: '80', TERM: 'xterm-256color' };
  delete env.NO_COLOR;
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../../cli/dist/create.js', import.meta.url)), 'my-system'], {
    cwd: temporary, env, encoding: 'utf8', timeout: 30_000,
  }).replaceAll(temporary, '/Users/you/Projects');
  const demo = { command: 'npm create dumb-diagrams@latest my-system', output };
  await mkdir(new URL('.astro/', site), { recursive: true });
  await mkdir(new URL('public/', site), { recursive: true });
  await writeFile(new URL('.astro/cli-demo.json', site), JSON.stringify(demo));
  await writeFile(new URL('public/cli-transcript.txt', site), `$ ${demo.command}\n${stripVTControlCharacters(output)}`);
} finally {
  // Only the throwaway project made above is removed.
  await rm(temporary, { recursive: true, force: true });
}
