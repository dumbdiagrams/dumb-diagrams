#!/usr/bin/env node

import { runCli } from "./index.js";

const COMMANDS = new Set([
  "help",
  "--help",
  "-h",
  "--version",
  "-v",
  "studio",
  "open",
  "render",
  "validate",
  "check",
  "format",
  "fmt",
  "init",
  "fixtures",
]);
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const firstArgument = args[0];
const cliArgs = firstArgument && COMMANDS.has(firstArgument) ? args : ["init", ...args];

runCli(cliArgs).then((code) => {
  if (code) process.exitCode = code;
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
