#!/usr/bin/env node

import { run } from "../dist/index.js";

run(process.argv).catch((error) => {
  console.error(`error: ${error?.message ?? error}`);
  process.exitCode = 1;
});
