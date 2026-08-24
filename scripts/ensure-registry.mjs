import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// npm pack never ships `.npmrc`; the AGPL source snapshot includes `registry.npmrc`
// instead. Restore `.npmrc` before install when that bundled file is present.
const bundled = join(process.cwd(), "registry.npmrc");
if (existsSync(bundled)) {
  copyFileSync(bundled, join(process.cwd(), ".npmrc"));
}
