#!/usr/bin/env node

import { run, handle, flush } from '@oclif/core';

// eslint-disable-next-line unicorn/prefer-top-level-await
run(process.argv.slice(2), import.meta.url)
  .catch(async (error) => {
    return handle(error);
  })
  .finally(async () => flush());
