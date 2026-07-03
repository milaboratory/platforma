#!/usr/bin/env node

const path = require("node:path");
const { run } = require("../dist/cli.js");

const packageRoot = path.resolve(__dirname, "..");

run(process.argv, packageRoot).catch((error) => {
  console.error(`error: ${error?.message ?? error}`);
  process.exitCode = 1;
});
