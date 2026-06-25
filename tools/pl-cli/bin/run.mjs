#!/usr/bin/env node

import { run } from "../dist/cli.js";

run(process.argv).catch((error) => {
  console.error(`error: ${error?.message ?? error}`);
  process.exitCode = 1;
});
