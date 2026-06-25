// This file is managed by `block-tools structure`. Do not edit by hand.
// Author content lives in ./block-extra.ts.

import { platforma } from "@milaboratories/milaboratories.test-download-file.model";
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
//
// TypeScript ships `ImportMeta.url` only in the `dom`/`webworker` libs; the
// facade tsconfig is lib-minimal (no `dom`, no `@types/node`) by design. We
// type the one ESM-standard member we use with a local cast rather than a
// `declare global` — a global augmentation would leak into the published
// `dist/index.d.ts` and clash with `@types/node`'s `ImportMeta` in full-Node
// consumers (test packages, the Middle Layer).
const selfUrl = (import.meta as ImportMeta & { url: string }).url;
const dirUrl  = selfUrl.slice(0, selfUrl.lastIndexOf("/"));
const rootUrl = dirUrl.slice(0, dirUrl.lastIndexOf("/"));

export const BlockPointer = {
  type: "from-pack-v2" as const,
  packUrl: rootUrl + "/block-pack",
  rootUrl,
} as const;

// Block-named aliases for readable cross-block imports in tests and
// consumer code. Same types / same runtime value as the universal
// names above; the aliases avoid `as`-renames at the import site.
export type TestDownloadFileBlockContract = BlockContract;
export type TestDownloadFileBlockOutputs  = BlockOutputs;
export type TestDownloadFileBlockData     = BlockData;
export type TestDownloadFileBlockHref     = BlockHref;
export const TestDownloadFileBlockPointer = BlockPointer;

export * from "./block-extra";
