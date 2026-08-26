import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parseDgm } from '@dumb-diagrams/runtime/dsl';
import { compileDiagram } from '@dumb-diagrams/runtime/render';

const site = fileURLToPath(new URL('../', import.meta.url));
const dist = join(site, 'dist');
const base = `/${(process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '') + '/';
const origin = 'https://website.test';
async function walk(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : join(directory, entry.name),
  ))).flat();
}

test('every internal page, anchor, and referenced asset resolves in the static build', async () => {
  const files = (await walk(dist)).filter(file => extname(file) === '.html' && !file.includes('~partytown'));
  assert.ok(files.length >= 13);
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const pagePath = file.slice(dist.length + 1).replace(/index\.html$/, '');
    const pageUrl = new URL(base + pagePath, origin);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${pagePath}: one main heading`);
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.doesNotMatch(html, /__VITE_PRELOAD__/, 'dynamic import helpers must be resolved');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${pagePath}: unique IDs`);
    for (const [, reference] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const target = new URL(reference.replaceAll('&amp;', '&'), pageUrl);
      if (target.origin !== origin) continue;
      assert.ok(target.pathname.startsWith(base), `${pagePath}: ${reference} escapes base ${base}`);
      let targetFile = resolve(dist, decodeURIComponent(target.pathname.slice(base.length)) || '.');
      assert.ok(targetFile === dist || targetFile.startsWith(dist + '/'));
      const info = await stat(targetFile).catch(() => null);
      assert.ok(info, `${pagePath}: missing ${reference}`);
      if (info.isDirectory()) targetFile = join(targetFile, 'index.html');
      if (target.hash && extname(targetFile) === '.html') {
        const targetHtml = await readFile(targetFile, 'utf8');
        const id = decodeURIComponent(target.hash.slice(1));
        assert.ok(targetHtml.includes(`id="${id}"`), `${pagePath}: missing anchor ${reference}`);
      }
    }
  }
});

test('complete documentation and homepage examples compile through the actual runtime', async () => {
  let checked = 0;
  for (const file of await walk(join(site, 'src'))) {
    const source = await readFile(file, 'utf8');
    const snippets = file.endsWith('.dgm') ? [source] : file.endsWith('.md')
      ? [...source.matchAll(/```dgm\n([\s\S]*?)```/g)].map(match => match[1]) : [];
    for (const snippet of snippets) {
      const result = compileDiagram(parseDgm(snippet));
      assert.equal(result.ok, true, `${file}: ${JSON.stringify(result.issues)}`);
      assert.equal(result.invariantFailures.length, 0, `${file}: clean example geometry`);
      checked++;
    }
  }
  assert.ok(checked >= 3);
});

test('downloadable diagrams have embedded icons and matching source files', async () => {
  for (const name of ['payments', 'events']) {
    const svg = await readFile(join(dist, 'diagrams', `${name}.svg`), 'utf8');
    assert.match(svg, /data:image\/svg\+xml/);
    assert.doesNotMatch(svg, /href="(?:https?:|catalog-icons\/|assets\/)/);
    assert.equal(await readFile(join(dist, 'diagrams', `${name}.dgm`), 'utf8'), await readFile(join(site, 'src/examples', `${name}.dgm`), 'utf8'));
  }
});

test('landing page stays small and loads no third-party scripts by default', async () => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<astro-island/);
  assert.doesNotMatch(html, /<script[^>]*src="https?:/);
  if (process.env.ENABLE_PARTYTOWN !== 'true') assert.doesNotMatch(html, /partytown/);
  assert.ok(gzipSync(html).byteLength < 15_000, 'homepage HTML under 15 KB compressed');
  let scriptBytes = 0;
  for (const [, script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    scriptBytes += gzipSync(script).byteLength;
  }
  for (const [, src] of html.matchAll(/<script[^>]*src="([^"]+)"/g)) {
    scriptBytes += gzipSync(await readFile(join(dist, src.slice(base.length)))).byteLength;
  }
  assert.ok(scriptBytes < 8_000, 'initial homepage JavaScript under 8 KB compressed');
  assert.ok((await stat(join(dist, 'pagefind/pagefind.js'))).size > 0);
});
