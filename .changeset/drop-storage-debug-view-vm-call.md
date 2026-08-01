---
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

Stop computing block storage debug views in the block VM

`ProjectOverview.blocks[].storageDebugView` and `BlockStateInternalV3.storageDebugView` are
removed, along with `ProjectHelper.getStorageDebugViewInVM`.

The value they carried is a pure function of a block's raw storage — the model's
`__pl_storage_debugView` callback just returns `{ dataVersion, data }` from normalised storage
and captures nothing block-specific. Producing it in the middle layer meant spinning up a
QuickJS runtime and evaluating the block's model bundle (276–480 KB) once per block on every
project-overview recomputation, whether or not anything consumed the result.

On a heavy project this measured at 72 VM instantiations and 1.2 s of bundle evaluation per
user edit — 58 % of all VM work for that edit — for a value only a developer-tools panel reads.

Consumers should derive it from the raw `blockStorage` they already receive:

```ts
import { normalizeBlockStorage } from "@platforma-sdk/model";

const storage = normalizeBlockStorage(blockState.blockStorage);
const debugView = { dataVersion: storage.__dataVersion, data: storage.__data };
```

This matches how `deriveDataFromStorage` is already used against raw storage elsewhere. The
`StorageDebugView` type and the model-side callback are unchanged.
