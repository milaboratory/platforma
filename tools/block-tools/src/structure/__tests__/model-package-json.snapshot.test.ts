// Snapshot of the canonical `model/package.json` that `init` produces
// for a representative BlockVars set. Catches accidental template /
// rule drift — any rule-set change that intentionally shifts the
// generated content must be paired with an updated fixture.

import { describe, expect, test } from "vitest";
import { simulateInit } from "../engine/testing";
import type { BlockVars } from "../engine/api";

const EXPECTED_MODEL_PACKAGE_JSON = `{
  "name": "@platforma-open/test-org.demo.model",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "sources": "./src/index.ts",
      "import": "./dist/index.js"
    },
    "./dist/*": "./dist/*"
  },
  "scripts": {
    "fmt": "ts-builder format",
    "watch": "ts-builder build --target block-model --watch",
    "build": "ts-builder build --target block-model && block-tools build-model",
    "check": "ts-builder check --target block-model"
  },
  "dependencies": {
    "@platforma-sdk/model": "catalog:"
  },
  "devDependencies": {
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    "@platforma-sdk/block-tools": "catalog:",
    "vitest": "catalog:"
  },
  "peerDependencies": {
    "@types/node": "*",
    "typescript": "*"
  }
}
`;

describe("model/package.json snapshot", () => {
  test("init produces canonical model/package.json", async () => {
    const vars: BlockVars = {
      facadeName: "@platforma-open/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@platforma-open",
      orgScope: "test-org",
      shortName: "demo",
    };
    const { fs } = simulateInit({ vars });
    const actual = fs.read("model/package.json");
    expect(actual).toBe(EXPECTED_MODEL_PACKAGE_JSON);
  });
});
