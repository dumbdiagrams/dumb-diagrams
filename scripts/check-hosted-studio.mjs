#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "packages/editor/dist-hosted");
const html = await readFile(join(dist, "index.html"), "utf8");
const headers = await readFile(join(dist, "_headers"), "utf8");

assert.match(headers, /Content-Security-Policy:/);
assert.match(headers, /https:\/\/studio\.dumbdiagrams\.com\/\*/);
assert.match(headers, /connect-src https:\/\/studio\.dumbdiagrams\.com\/catalog-icons\//);
assert.match(headers, /https:\/\/:project\.pages\.dev\/\*/);
assert.match(headers, /connect-src https:\/\/:project\.pages\.dev\/catalog-icons\//);
assert.match(headers, /https:\/\/:version\.:project\.pages\.dev\/\*/);
assert.match(headers, /connect-src https:\/\/:version\.:project\.pages\.dev\/catalog-icons\//);
assert.doesNotMatch(headers, /\*\.pages\.dev\/catalog-icons/);
assert.match(headers, /frame-ancestors 'none'/);
assert.match(headers, /form-action 'none'/);
const connectDirective = headers.match(/connect-src\s+([^;\n]+)/)?.[1] ?? "";
assert.ok(connectDirective, "connect-src directive is present");
assert.doesNotMatch(connectDirective, /(?:^|\s)'self'(?:\s|$)/);
assert.doesNotMatch(html, /googletagmanager|google-analytics|partytown/i);
assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
assert.match(html, /<script[^>]+type=["']module["']/);
assert.ok((await stat(join(dist, "assets"))).isDirectory(), "bundled assets are present");
assert.ok((await stat(join(dist, "catalog-icons"))).isDirectory(), "catalog icons are present");

console.log(`Hosted Studio output verified: ${dist}`);
