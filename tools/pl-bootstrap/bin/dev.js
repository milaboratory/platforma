#!/usr/bin/env node_modules/.bin/ts-node

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-disable-next-line node/shebang, unicorn/prefer-top-level-await
(async () => {
  const oclif = await import("@oclif/core");
  await oclif.execute({ development: true, dir: __dirname });
})();
