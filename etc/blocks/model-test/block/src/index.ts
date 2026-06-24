// This file is managed by `block-tools structure`. Do not edit by hand.
// Author content lives in ./block-extra.ts.

import { platforma } from "@milaboratories/milaboratories.test-block-model.model";
import {
  InferOutputsType,
  InferDataType,
  InferHrefType,
} from "@platforma-sdk/model";

export { platforma };

export type BlockContract = {
  outputs: InferOutputsType<typeof platforma>;
  data:    InferDataType<typeof platforma>;
  href:    InferHrefType<typeof platforma>;
};

export type BlockOutputs = BlockContract["outputs"];
export type BlockData    = BlockContract["data"];
export type BlockHref    = BlockContract["href"];

// import.meta.url is a file: URL (always forward-slash, even on Windows:
// file:///C:/…). We expose URLs, NOT paths — the facade stays dependency-free
// and loadable in minimal engines (e.g. QuickJS), and each consumer converts
// at its own edge with the right tool (fileURLToPath in Node), where Windows
// drive letters / %-encoding / UNC are handled correctly. The bundled entry
// sits one dir under the package root (dist/index.js, or src/index.ts in dev),
// so the root is two URL segments up. The structurer owns this layout —
// consumers read these URLs, they never reconstruct <root>/block-pack.
const dirUrl  = import.meta.url.slice(0, import.meta.url.lastIndexOf("/"));
const rootUrl = dirUrl.slice(0, dirUrl.lastIndexOf("/"));

export const BlockPointer = {
  type: "from-pack-v2" as const,
  packUrl: rootUrl + "/block-pack",
  rootUrl,
} as const;

// Block-named aliases for readable cross-block imports in tests and
// consumer code. Same types / same runtime value as the universal
// names above; the aliases avoid `as`-renames at the import site.
export type TestBlockModelBlockContract = BlockContract;
export type TestBlockModelBlockOutputs  = BlockOutputs;
export type TestBlockModelBlockData     = BlockData;
export type TestBlockModelBlockHref     = BlockHref;
export const TestBlockModelBlockPointer = BlockPointer;

export * from "./block-extra";
