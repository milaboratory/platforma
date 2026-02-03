# Packages using ts-builder with .oxlintrc.json

Base config path: `node_modules/@milaboratories/ts-builder/dist/configs/oxclint-base.json`

## Migration completed

All 69 packages using ts-builder now have `.oxlintrc.json` files.

### Packages with custom rules (5)

These packages have additional rules or ignorePatterns beyond the base extends:

| Package | Path |
|---------|------|
| pl-client | `lib/node/pl-client/.oxlintrc.json` |
| pl-drivers | `lib/node/pl-drivers/.oxlintrc.json` |
| biowasm-tools | `lib/other/biowasm-tools/.oxlintrc.json` |
| ptabler/js | `lib/ptabler/js/.oxlintrc.json` |
| sdk/model | `sdk/model/.oxlintrc.json` |

### Packages with base extends only (64)

| # | Package Path |
|---|--------------|
| 1 | `tools/ts-builder` |
| 2 | `tools/block-tools` |
| 3 | `tools/package-builder` |
| 4 | `tools/pl-bootstrap` |
| 5 | `tools/tengo-builder` |
| 6 | `tools/oclif-index` |
| 7 | `lib/ui/uikit` |
| 8 | `lib/model/backend` |
| 9 | `lib/model/common` |
| 10 | `lib/model/middle-layer` |
| 11 | `lib/model/pl-error-like` |
| 12 | `lib/node/computable` |
| 13 | `lib/node/pf-driver` |
| 14 | `lib/node/pl-config` |
| 15 | `lib/node/pl-deployments` |
| 16 | `lib/node/pl-errors` |
| 17 | `lib/node/node-streams` |
| 18 | `lib/node/pl-http` |
| 19 | `lib/node/pl-middle-layer` |
| 20 | `lib/node/pl-tree` |
| 21 | `lib/node/ts-helpers-oclif` |
| 22 | `lib/node/ts-helpers-winston` |
| 23 | `lib/node/ts-helpers` |
| 24 | `lib/ptabler/schema` |
| 25 | `lib/util/helpers` |
| 26 | `lib/util/test-helpers` |
| 27 | `lib/util/sequences` |
| 28 | `sdk/test` |
| 29 | `sdk/ui-vue` |
| 30 | `etc/uikit-playground` |
| 31 | `etc/ui-vue-docs` |
| 32 | `etc/blocks/monetization-test/workflow` |
| 33 | `etc/blocks/download-file/model` |
| 34 | `etc/blocks/download-file/ui` |
| 35 | `etc/blocks/read-logs/model` |
| 36 | `etc/blocks/read-logs/ui` |
| 37 | `etc/blocks/ui-examples/model` |
| 38 | `etc/blocks/ui-examples/ui` |
| 39 | `etc/blocks/enter-numbers/model` |
| 40 | `etc/blocks/enter-numbers/ui` |
| 41 | `etc/blocks/model-test/model` |
| 42 | `etc/blocks/model-test/test` |
| 43 | `etc/blocks/model-test/ui` |
| 44 | `etc/blocks/monetization-test/model` |
| 45 | `etc/blocks/monetization-test/ui` |
| 46 | `etc/blocks/upload-file/model` |
| 47 | `etc/blocks/upload-file/ui` |
| 48 | `etc/blocks/sum-numbers/model` |
| 49 | `etc/blocks/sum-numbers/ui` |
| 50 | `etc/blocks/sum-numbers-v3/model` |
| 51 | `etc/blocks/sum-numbers-v3/ui` |
| 52 | `etc/blocks/pool-explorer/model` |
| 53 | `etc/blocks/pool-explorer/ui` |
| 54 | `etc/blocks/enter-numbers-v3/model` |
| 55 | `etc/blocks/enter-numbers-v3/ui` |
| 56 | `etc/blocks/blob-url-custom-protocol/model` |
| 57 | `etc/blocks/blob-url-custom-protocol/ui` |
| 58 | `etc/blocks/transfer-files/model` |
| 59 | `etc/blocks/transfer-files/ui` |
| 60 | `tests/workflow-tengo` |
| 61 | `tests/helper` |
| 62 | `tests/block-repo` |
| 63 | `tests/config-local-ml-integration` |
| 64 | `tests/drivers-ml-blocks-integration` |

## Template for .oxlintrc.json

```json
{
  "extends": [
    "node_modules/@milaboratories/ts-builder/dist/configs/oxclint-base.json"
  ]
}
```
