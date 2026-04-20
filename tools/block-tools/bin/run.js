#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
  const oclif = await import("@oclif/core");
  await oclif.execute({ dir: __dirname });
})();
