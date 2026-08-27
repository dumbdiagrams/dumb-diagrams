import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parseDgm } from '@dumb-diagrams/runtime/dsl';
import { compileDiagram } from '@dumb-diagrams/runtime/render';
import { createCliUi } from '../../cli/src/cli-ui.ts';
import { stripVTControlCharacters } from 'node:util';
import { loadExamples } from '../src/lib/examples.mjs';
import { ansiToHtml } from '../src/lib/ansi.mjs';
import { analyticsConfig } from '../src/lib/analytics-config.mjs';
import { privacyConfig } from '../src/lib/privacy-config.mjs';

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
  for (const example of loadExamples()) {
    const result = compileDiagram(parseDgm(example.source));
    assert.equal(result.ok, true, `${example.id}: original Studio source compiles`);
    // These are the app's existing examples, including any existing routing
    // notes. The website must not rewrite their geometry to hide those notes.
    checked++;
  }
  assert.ok(checked >= 5);
});

test('downloadable diagrams are portable and previews reserve their actual dimensions', async () => {
  const homepage = await readFile(join(dist, 'index.html'), 'utf8');
  const initialZooms = [...homepage.matchAll(/data-diagram-preview data-initial-zoom="([^"]+)"/g)].map(([, zoom]) => zoom);
  assert.ok(initialZooms.length >= 3, 'homepage renders all example previews with an initial zoom');
  assert.deepEqual(new Set(initialZooms), new Set(['1']), 'all example previews open at 100%');
  for (const file of (await readdir(join(site, 'src/examples'))).filter(file => file.endsWith('.dgm'))) {
    const name = file.slice(0, -4);
    const svg = await readFile(join(dist, 'diagrams', `${name}.svg`), 'utf8');
    assert.match(svg, /data:image\/svg\+xml/);
    assert.doesNotMatch(svg, /href="(?:https?:|catalog-icons\/|assets\/)/);
    assert.equal(await readFile(join(dist, 'diagrams', `${name}.dgm`), 'utf8'), await readFile(join(site, 'src/examples', `${name}.dgm`), 'utf8'));
  }
  for (const example of loadExamples()) {
    assert.equal(await readFile(join(dist, 'diagrams', `${example.id}.dgm`), 'utf8'), example.source);
    assert.equal(await readFile(join(dist, 'diagrams', `${example.id}-prompt.txt`), 'utf8'), example.prompt);
    const svg = await readFile(join(dist, 'diagrams', `${example.id}.svg`), 'utf8');
    assert.match(svg, /data:image\/svg\+xml/);
    assert.doesNotMatch(svg, /href="(?:https?:|catalog-icons\/|assets\/)/);
    const previewName = `${example.id}-preview.svg`;
    const preview = await readFile(join(dist, 'diagrams', previewName), 'utf8');
    const dimensions = preview.match(/<svg\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/);
    assert.ok(dimensions, `${example.id}: generated preview dimensions`);
    const image = [...homepage.matchAll(/<img\b[^>]*>/g)].find(([tag]) => tag.includes(`/diagrams/${previewName}`))?.[0];
    assert.ok(image, `${example.id}: homepage preview image`);
    assert.ok(image.includes(`width="${dimensions[1]}"`), `${example.id}: reserved preview width matches the SVG`);
    assert.ok(image.includes(`height="${dimensions[2]}"`), `${example.id}: reserved preview height matches the SVG`);
  }
});

test('landing page stays small and loads no third-party scripts by default', async () => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<astro-island/);
  assert.doesNotMatch(html, /<script[^>]*src="https?:/);
  if (!analyticsConfig().measurementId && process.env.ENABLE_PARTYTOWN !== 'true') assert.doesNotMatch(html, /partytown/);
  // The optional consent UI and inline Partytown bootstrap add a bounded 3 KB.
  const htmlBudget = analyticsConfig().measurementId ? 18_000 : 15_000;
  assert.ok(gzipSync(html).byteLength < htmlBudget, `homepage HTML under ${htmlBudget} bytes compressed`);
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

test('LLM-first metadata, structured data, and production rendering stay intact', async () => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.match(html, /<title>LLM-first architecture diagrams as code \| Dumb Diagrams<\/title>/);
  assert.match(html, /Architecture diagrams as code, built for an LLM-first workflow/);
  assert.doesNotMatch(html, /AI-first/i);
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@type'], 'SoftwareApplication');
  assert.equal(schema.name, 'Dumb Diagrams');
  assert.match(html, /<link rel="preload"[^>]+as="font"[^>]+crossorigin/);
  assert.doesNotMatch(html, /<h1[^>]+data-reveal/);
  assert.doesNotMatch(html, /@vite\/client/);
  if (process.env.SITE_URL) {
    const canonical = new URL(base, process.env.SITE_URL).href;
    assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
    assert.equal(schema.url, canonical);
    assert.ok((await readFile(join(dist, 'robots.txt'), 'utf8')).includes(`${canonical}sitemap-index.xml`));
    const sitemap = await readFile(join(dist, 'sitemap-0.xml'), 'utf8');
    assert.ok(sitemap.includes(`${canonical}docs/agent-workflow/`));
    assert.ok(!sitemap.includes('/404'));
    const docs = await readFile(join(dist, 'docs/agent-workflow/index.html'), 'utf8');
    const breadcrumbs = JSON.parse(docs.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(breadcrumbs.itemListElement[2].item, `${canonical}docs/agent-workflow/`);
  }
});

test('GA4 is opt-in and Partytown worker files resolve at the configured base', async () => {
  const { measurementId } = analyticsConfig();
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src="https:\/\/www.googletagmanager.com/);
  if (measurementId) {
    assert.ok(html.includes(`data-analytics-id="${measurementId}"`));
    assert.match(html, /data-analytics-choice="denied"/);
    assert.match(html, /data-analytics-choice="granted"/);
    assert.match(html, /Reject/);
    assert.match(html, /type="text\/partytown"/);
  } else {
    assert.doesNotMatch(html, /data-analytics-id=/);
  }
  if (measurementId || process.env.ENABLE_PARTYTOWN === 'true') {
    assert.ok(html.includes(`${base}~partytown/`));
    for (const file of ['partytown-sw.js', 'partytown.js', 'partytown-atomics.js']) {
      assert.ok((await stat(join(dist, '~partytown', file))).size > 0, `${base}~partytown/${file} must resolve`);
    }
  }
});

test('analytics configuration rejects invalid IDs and permits an unconfigured build', () => {
  assert.deepEqual(analyticsConfig({}), { measurementId: '' });
  const privacy = { PUBLIC_SITE_OPERATOR: 'Test operator', PUBLIC_PRIVACY_EMAIL: 'privacy@example.test', PUBLIC_ANALYTICS_RETENTION_MONTHS: '2' };
  assert.deepEqual(analyticsConfig({ ...privacy, PUBLIC_GA_MEASUREMENT_ID: ' G-TEST12345 ' }), { measurementId: 'G-TEST12345' });
  assert.throws(() => analyticsConfig({ PUBLIC_GA_MEASUREMENT_ID: 'GTM-12345' }), /GA4 measurement ID/);
  assert.throws(() => analyticsConfig({ PUBLIC_GA_MEASUREMENT_ID: '</script>' }), /GA4 measurement ID/);
  assert.throws(() => analyticsConfig({ PUBLIC_GA_MEASUREMENT_ID: 'G-TEST12345' }), /review the privacy notice/);
  assert.throws(() => privacyConfig({ PUBLIC_PRIVACY_EMAIL: 'invalid' }), /valid contact email/);
  assert.throws(() => privacyConfig({ PUBLIC_ANALYTICS_RETENTION_MONTHS: 'forever' }), /2 or 14/);
});

test('privacy notice and footer controls are available with and without analytics', async () => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  const privacy = await readFile(join(dist, 'privacy/index.html'), 'utf8');
  assert.ok(html.includes(`href="${base}privacy/"`));
  assert.ok(html.includes(`href="${base}privacy/#cookie-settings"`));
  assert.match(html, /class="footer-privacy"/);
  assert.doesNotMatch(html, /cookie-preferences-fab/);
  assert.match(html, /data-analytics-revoke hidden/);
  assert.match(html, /<strong>A little opinionated\.<\/strong><br\s*\/?><strong>A lot clearer\.<\/strong>/);
  assert.match(privacy, /id="cookie-settings"/);
  assert.match(privacy, /does not automatically delete data already sent to Google/);
  if (!privacyConfig().ready) assert.match(privacy, /Pre-launch notice/);
  if (analyticsConfig().measurementId) {
    assert.match(html, /Reject/);
    assert.match(html, /Necessary only/);
    assert.match(html, /Accept all/);
  } else assert.match(privacy, /Google Analytics is not enabled/);
});

test('homepage explains the engine and attributes examples without altering their sources', async () => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.match(html, /Generated with GPT 5\.6 Luna \(max\)/);
  for (const name of ['Composer 2.5', 'Claude Sonnet 5', 'A* search', 'manual route', 'lighter models']) assert.ok(html.includes(name), name);
  assert.match(html, /<div class="section-heading examples-heading" id="how-it-works"/);
  assert.doesNotMatch(html, /<section[^>]+id="how-it-works"/);
  assert.match(html, /class="faq-brand"/);
});

test('terminal fallback contains the real CLI banner and runnable package commands', async () => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  const cli = createCliUi({ color: false, columns: 80 });
  const demo = JSON.parse(await readFile(join(site, '.astro/cli-demo.json'), 'utf8'));
  const plain = stripVTControlCharacters(demo.output);
  const banner = html.match(/<pre\b[^>]*class="terminal-banner"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  assert.ok(banner);
  assert.equal(banner.replace(/<[^>]+>/g, ''), cli.banner(), 'the full CLI banner survives ANSI rendering');
  assert.ok(banner.includes('color:rgb(248,162,63)'), 'CLI amber starting color');
  assert.ok(banner.includes('color:rgb(36,64,104)'), 'CLI navy ending color');
  assert.ok(plain.includes(cli.summary('Project ready').trim()));
  assert.ok(plain.indexOf('Creating diagram space') < plain.indexOf('Created my-system/diagrams/architecture.dgm'));
  assert.ok(plain.indexOf('Created my-system/CATALOG.json') < plain.indexOf('Project ready'));
  assert.equal(await readFile(join(dist, 'cli-transcript.txt'), 'utf8'), `$ ${demo.command}\n${plain}`);
  assert.ok(html.includes('npm create dumb-diagrams@latest my-system'));
  assert.match(
    html,
    /color:rgb\(248,162,63\)">npx create-dumb-diagrams@latest studio my-system\/diagrams<\/span>/,
    'next command uses the high-contrast CLI command color',
  );
  assert.match(html, /<div\b[^>]*class="terminal-controls"[^>]*hidden/, 'controls stay hidden without JavaScript');
  assert.doesNotMatch(html, /\x1b/);
});

test('ANSI conversion preserves CLI text while escaping markup', () => {
  assert.equal(ansiToHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  assert.equal(ansiToHtml('\x1b[38;2;36;64;104mnavy\x1b[0m plain'), '<span style="color:rgb(36,64,104)">navy</span> plain');
  assert.equal(ansiToHtml('\x1b[1mbold\x1b[22m normal'), '<span style="font-weight:700">bold</span> normal');
});
