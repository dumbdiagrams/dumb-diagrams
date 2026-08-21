#!/usr/bin/env node
import { readFileSync, writeFileSync, watch, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

import {
  createAsyncDocsFixture,
  createTransferHubFixture,
} from "@dumb-diagrams/core";
import { getCatalogEntryByBrowserPath } from "@dumb-diagrams/catalog";
import { parseDgm } from "@dumb-diagrams/dsl";
import { compileDiagram, renderPortableSvg } from "@dumb-diagrams/render";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "render":
      await cmdRender(args[0], args[1]);
      break;
    case "check":
      await cmdCheck(args[0]);
      break;
    case "dev":
      await cmdDev(args[0], Number(args[1]) || 5173);
      break;
    case "fixtures":
      await cmdFixtures(args[0]);
      break;
    default:
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

function printHelp() {
  console.log(`DumbDiagrams — diagram compiler

Usage:
  dgm render <file.dgm> [output.svg]
  dgm check <dir>
  dgm dev <file.dgm> [port]
  dgm fixtures <name>   # async-docs | transfer-hub
`);
}

async function cmdRender(input?: string, output?: string) {
  const doc = loadDocument(input);
  const result = compileDiagram(doc);
  if (!result.ok) {
    console.error("Validation errors:");
    for (const issue of result.issues) {
      console.error(`  [${issue.level}] ${issue.message}`);
    }
    process.exit(1);
  }
  if (result.invariantFailures.length) {
    console.warn("Invariant warnings:");
    for (const f of result.invariantFailures) {
      console.warn(`  ${f.message}`);
    }
  }
  const out = output ?? "output.svg";
  writeFileSync(out, await renderPortableSvg(doc, result.layout!, {
    loadCatalogSvg: loadCatalogSvg,
  }));
  console.log(`Wrote ${out}`);
}

async function cmdCheck(dir?: string) {
  const target = dir ?? "examples/src";
  const root = resolve(process.cwd(), target);
  const files = collectDgmFiles(root);
  let failed = 0;
  for (const file of files) {
    const doc = parseDgm(readFileSync(file, "utf8"));
    const result = compileDiagram(doc);
    const name = file.replace(root + "/", "");
    if (!result.ok) {
      console.error(`FAIL ${name}: validation errors`);
      failed++;
      continue;
    }
    const labelHits = result.invariantFailures.filter(
      (f) => f.code === "edge-label-collision",
    );
    if (labelHits.length) {
      console.error(`FAIL ${name}: ${labelHits.length} label collision(s)`);
      for (const f of labelHits) console.error(`  ${f.message}`);
      failed++;
      continue;
    }
    if (result.invariantFailures.length) {
      console.warn(
        `WARN ${name}: ${result.invariantFailures.length} soft routing note(s)`,
      );
    }
    console.log(`OK ${name}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

async function cmdDev(input?: string, port = 5173) {
  const file = input ?? "examples/src/async-docs.dgm";
  const abs = resolve(process.cwd(), file);

  const renderPage = async () => {
    const doc = loadDocument(abs);
    const result = compileDiagram(doc);
    const svg = result.ok
      ? await renderPortableSvg(doc, result.layout!, { loadCatalogSvg })
      : `<svg><text x="10" y="20">Error</text></svg>`;
    const issues = result.ok
      ? result.invariantFailures
      : result.issues.map((i) => ({ message: i.message }));
    return buildDevHtml(readFileSync(abs, "utf8"), svg ?? "", issues);
  };

  let html = await renderPage();

  const server = createServer(async (req, res) => {
    if (req.url === "/") {
      html = await renderPage();
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    if (req.url === "/svg") {
      const doc = loadDocument(abs);
      const result = compileDiagram(doc);
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(result.ok ? await renderPortableSvg(doc, result.layout!, { loadCatalogSvg }) : "");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  watch(abs, () => {
    console.log("Recompiled", file);
    void renderPage().then((next) => { html = next; });
  });

  server.listen(port, () => {
    console.log(`dgm dev: http://localhost:${port}`);
    console.log(`Watching ${file}`);
  });
}

async function cmdFixtures(name?: string) {
  const fixtures: Record<string, () => ReturnType<typeof createAsyncDocsFixture>> = {
    "async-docs": createAsyncDocsFixture,
    "transfer-hub": createTransferHubFixture,
  };
  const fn = fixtures[name ?? "async-docs"];
  if (!fn) {
    console.error(`Unknown fixture: ${name}`);
    process.exit(1);
  }
  const doc = fn();
  const result = compileDiagram(doc);
  const out = `fixtures/golden/${name ?? "async-docs"}.svg`;
  writeFileSync(out, await renderPortableSvg(doc, result.layout!, { loadCatalogSvg }));
  console.log(`Wrote ${out}`);
  if (result.invariantFailures?.length) {
    for (const f of result.invariantFailures) console.warn(f.message);
  }
}

function loadDocument(input?: string) {
  if (!input) return createAsyncDocsFixture();
  if (input.endsWith(".dgm")) {
    return parseDgm(readFileSync(resolve(process.cwd(), input), "utf8"));
  }
  const fixtures: Record<string, () => ReturnType<typeof createAsyncDocsFixture>> = {
    "async-docs": createAsyncDocsFixture,
    "transfer-hub": createTransferHubFixture,
  };
  if (fixtures[input]) return fixtures[input]!();
  return parseDgm(readFileSync(resolve(process.cwd(), input), "utf8"));
}

function collectDgmFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectDgmFiles(p));
    else if (p.endsWith(".dgm")) out.push(p);
  }
  return out;
}

function loadCatalogSvg(browserPath: string): Promise<string> {
  const entry = getCatalogEntryByBrowserPath(browserPath);
  if (!entry) return Promise.reject(new Error(`Unknown catalog asset ${browserPath}`));
  return Promise.resolve(readFileSync(resolve(__dirname, "../../..", entry.icon.sourcePath), "utf8"));
}

function buildDevHtml(
  source: string,
  svg: string,
  issues: Array<{ message: string }>,
): string {
  const issueHtml = issues.length
    ? `<div class="issues">${issues.map((i) => `<div>${escapeHtml(i.message)}</div>`).join("")}</div>`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>DumbDiagrams</title>
  <style>
    :root { --bg:#0e1116; --elev:#161b22; --border:#2b313a; --text:#e7ecf1; --dim:#8b949e; }
    html, body { height:100%; overflow:hidden; overscroll-behavior:none; overscroll-behavior-x:none; }
    * { box-sizing: border-box; margin: 0; }
    body { display: flex; height: 100vh; font-family: "IBM Plex Sans", system-ui, sans-serif; background: var(--bg); color: var(--text); }
    .source { width: 38%; border-right: 1px solid var(--border); overflow: auto; overscroll-behavior: none; }
    .source pre { padding: 16px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; color:#d5dde5; }
    .canvas { flex: 1; overflow: hidden; background: #eef1f4; position: relative; overscroll-behavior: none; touch-action: none; }
    .world { position:absolute; transform-origin:0 0; }
    .issues { background: #3d2e00; color:#e3b341; padding: 8px 16px; font-size: 12px; }
    .hint { position:absolute; right:12px; bottom:12px; font-size:11px; color:#5b6570; background:rgba(255,255,255,.72); padding:4px 8px; border-radius:999px; }
  </style>
</head>
<body>
  <div class="source">
    ${issueHtml}
    <pre>${escapeHtml(source)}</pre>
  </div>
  <div class="canvas" id="stage">
    <div class="world" id="world">${svg}</div>
    <div class="hint">scroll to pan · pinch / ⌃+scroll to zoom</div>
  </div>
  <script>
    const stage = document.getElementById('stage');
    const world = document.getElementById('world');
    let x = 32, y = 32, k = 1;
    const apply = () => { world.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + k + ')'; };
    apply();
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        k = Math.min(2.5, Math.max(0.25, k * factor));
      } else {
        x -= e.deltaX; y -= e.deltaY;
      }
      apply();
    }, { passive: false });
    window.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    }, { passive: false });
    setInterval(() => fetch('/').then(r => r.text()).then(h => { if (!h.includes('Error')) location.reload(); }), 2000);
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
