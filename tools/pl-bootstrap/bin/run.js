#!/usr/bin/env node

const { run } = require("../dist/index.js");

run(process.argv).catch((error) => {
  console.error(`error: ${error?.message ?? error}`);
  process.exitCode = 1;
});
