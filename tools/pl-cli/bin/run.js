#!/usr/bin/env node

import { execute } from "@oclif/core";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
await execute({ dir: __dirname });
