# Migration Plan: oxlintrc.json extends by type

**Status: COMPLETED**

Replaced `oxclint-base.json` with specific configs:
- `oxclint-block-ui.json` - for block UI packages
- `oxclint-block-model.json` - for block model packages  
- `oxclint-test.json` - for test packages
- `oxclint-node.json` - for node packages

## block-ui (16 packages) ✓

| # | Path |
|---|------|
| 1 | `etc/blocks/download-file/ui` |
| 2 | `etc/blocks/read-logs/ui` |
| 3 | `etc/blocks/ui-examples/ui` |
| 4 | `etc/blocks/enter-numbers/ui` |
| 5 | `etc/blocks/model-test/ui` |
| 6 | `etc/blocks/monetization-test/ui` |
| 7 | `etc/blocks/upload-file/ui` |
| 8 | `etc/blocks/sum-numbers/ui` |
| 9 | `etc/blocks/sum-numbers-v3/ui` |
| 10 | `etc/blocks/pool-explorer/ui` |
| 11 | `etc/blocks/enter-numbers-v3/ui` |
| 12 | `etc/blocks/blob-url-custom-protocol/ui` |
| 13 | `etc/blocks/transfer-files/ui` |
| 14 | `lib/ui/uikit` |
| 15 | `sdk/ui-vue` |
| 16 | `etc/uikit-playground` |

## block-model (19 packages) ✓

| # | Path |
|---|------|
| 1 | `etc/blocks/download-file/model` |
| 2 | `etc/blocks/read-logs/model` |
| 3 | `etc/blocks/ui-examples/model` |
| 4 | `etc/blocks/enter-numbers/model` |
| 5 | `etc/blocks/model-test/model` |
| 6 | `etc/blocks/monetization-test/model` |
| 7 | `etc/blocks/monetization-test/workflow` |
| 8 | `etc/blocks/upload-file/model` |
| 9 | `etc/blocks/sum-numbers/model` |
| 10 | `etc/blocks/sum-numbers-v3/model` |
| 11 | `etc/blocks/pool-explorer/model` |
| 12 | `etc/blocks/enter-numbers-v3/model` |
| 13 | `etc/blocks/blob-url-custom-protocol/model` |
| 14 | `etc/blocks/transfer-files/model` |
| 15 | `sdk/model` |
| 16 | `lib/model/backend` |
| 17 | `lib/model/common` |
| 18 | `lib/model/middle-layer` |
| 19 | `lib/model/pl-error-like` |

## test (8 packages) ✓

| # | Path |
|---|------|
| 1 | `etc/blocks/model-test/test` |
| 2 | `tests/workflow-tengo` |
| 3 | `tests/helper` |
| 4 | `tests/block-repo` |
| 5 | `tests/config-local-ml-integration` |
| 6 | `tests/drivers-ml-blocks-integration` |
| 7 | `sdk/test` |
| 8 | `lib/util/test-helpers` |

## node (26 packages) ✓

| # | Path |
|---|------|
| 1 | `tools/ts-builder` (uses local path) |
| 2 | `tools/block-tools` |
| 3 | `tools/package-builder` |
| 4 | `tools/pl-bootstrap` |
| 5 | `tools/tengo-builder` |
| 6 | `tools/oclif-index` |
| 7 | `lib/node/pl-drivers` |
| 8 | `lib/node/pl-client` |
| 9 | `lib/node/computable` |
| 10 | `lib/node/pf-driver` |
| 11 | `lib/node/pl-config` |
| 12 | `lib/node/pl-deployments` |
| 13 | `lib/node/pl-errors` |
| 14 | `lib/node/node-streams` |
| 15 | `lib/node/pl-http` |
| 16 | `lib/node/pl-middle-layer` |
| 17 | `lib/node/pl-tree` |
| 18 | `lib/node/ts-helpers-oclif` |
| 19 | `lib/node/ts-helpers-winston` |
| 20 | `lib/node/ts-helpers` |
| 21 | `lib/ptabler/js` |
| 22 | `lib/ptabler/schema` |
| 23 | `lib/util/helpers` |
| 24 | `lib/util/sequences` |
| 25 | `lib/other/biowasm-tools` |
| 26 | `etc/ui-vue-docs` |
