#!/usr/bin/env node

console.error("sync:icons is retired. Use `pnpm icons:update --provider <name> --accept-terms` followed by `pnpm icons:build`.");
process.exitCode = 1;
