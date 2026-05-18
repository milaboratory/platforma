import type { CompiledTemplateV3, TemplateDataV3 } from "@milaboratories/pl-model-backend";

import type { FullArtifactName } from "./package";
import { fullNameToString } from "./package";

// Build-time size guards mirroring the two backend caps that gate template
// ingestion. Hardcoded because tengo-builder runs at block build time and has
// no connection to a running backend; if pl ever changes the caps, update the
// constants here in lockstep with the source-of-truth lines pointed at below.
//
// Source of truth (`core/pl` repo):
//  - platform/core/transaction/assertions.go  : `maxResourceDataSize`
//      3 MiB per value resource, checked on every CreateValue marshal.
//      Hits the WasmV1 resource after the controller unpacks a template pack
//      into its constituent libs/software/wasm resources.
//  - controllers/workflow/pkg/cfg/config.go   : `TemplatePackSizeLimit`
//      3.5 MiB per gzipped template pack, checked before the pack itself is
//      stored as a TengoTemplatePackV1 value resource.

// 2 MiB raw → ~2.67 MiB base64 + JSON wrapper → comfortably under the 3 MiB
// per-value-resource cap with ~330 KiB headroom for the WasmV1Data wrapper
// (Name, Version, Runtime, DefaultMemoryLimit, JSON syntax). WasmV1Data.Code
// is a Go `[]byte`, which encoding/json serialises as base64 — that's where
// the 4/3 expansion comes from.
export const MAX_WASM_FILE_BYTES = 2 * 1024 * 1024;

// 100 KiB below the backend's 3.5 MiB so blocks don't break on small
// platform-side metadata overhead, or if pl tightens the limit slightly.
export const MAX_TEMPLATE_PACK_BYTES_GZIPPED = 3.5 * 1024 * 1024 - 100 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

export function assertWasmFileSize(
  file: string,
  byteLength: number,
  fullName: FullArtifactName,
): void {
  if (byteLength <= MAX_WASM_FILE_BYTES) return;
  throw new Error(
    `WASM artefact ${fullNameToString(fullName)} from ${file} is ${formatBytes(byteLength)}, ` +
      `which exceeds tengo-builder's ${formatBytes(MAX_WASM_FILE_BYTES)} per-WASM cap. ` +
      `The backend stores each WASM as a single value resource (3 MiB hard cap after base64+JSON ` +
      `marshal — see maxResourceDataSize in pl: platform/core/transaction/assertions.go). ` +
      `Strip debug info or run \`wasm-opt -Oz\` to shrink it.`,
  );
}

export interface WasmContribution {
  /** Artefact name as stored under TemplateDataV3.wasm (e.g. "@pkg:id"). */
  readonly name: string;
  /** Raw WASM bytes — decoded from the base64-encoded source in hashToSource. */
  readonly rawBytes: number;
}

/**
 * Walks a compiled template tree and reports every WASM artefact embedded
 * directly or transitively. Used only by the too-large-pack error message —
 * never on the success path. Deduplicates by artefact name (sub-templates can
 * import the same WASM via different aliases and we want to attribute weight
 * only once).
 */
export function collectWasmContributions(tpl: CompiledTemplateV3): WasmContribution[] {
  const seen = new Map<string, WasmContribution>();
  function walk(t: TemplateDataV3) {
    for (const [name, ref] of Object.entries(t.wasm ?? {})) {
      if (seen.has(name)) continue;
      const base64 = tpl.hashToSource[ref.sourceHash];
      // base64 encodes 3 raw bytes per 4 chars; the off-by-padding is at most
      // 2 bytes per artefact — fine for a human-readable size breakdown.
      const rawBytes = base64 != null ? Math.floor((base64.length * 3) / 4) : 0;
      seen.set(name, { name, rawBytes });
    }
    for (const sub of Object.values(t.templates ?? {})) walk(sub);
  }
  walk(tpl.template);
  return [...seen.values()];
}

export function assertTemplatePackSize(
  templateName: string,
  gzippedByteLength: number,
  wasmContributions: readonly WasmContribution[],
): void {
  if (gzippedByteLength <= MAX_TEMPLATE_PACK_BYTES_GZIPPED) return;
  const ranked = [...wasmContributions].sort((a, b) => b.rawBytes - a.rawBytes);
  const breakdown =
    ranked.length === 0
      ? "\n  (no WASM artefacts in this pack — heavy libs, software descriptors, or sub-templates are the likely cause.)"
      : "\nWASM artefacts in this pack (raw bytes):\n" +
        ranked.map((w) => `  - ${w.name} — ${formatBytes(w.rawBytes)}`).join("\n");
  throw new Error(
    `Template pack ${templateName} is ${formatBytes(gzippedByteLength)} gzipped, ` +
      `which exceeds tengo-builder's ${formatBytes(MAX_TEMPLATE_PACK_BYTES_GZIPPED)} per-pack cap. ` +
      `The backend caps gzipped packs at 3.5 MiB (see TemplatePackSizeLimit in pl: ` +
      `controllers/workflow/pkg/cfg/config.go).` +
      breakdown +
      "\nShrink WASM artefacts (wasm-opt -Oz), or split this template into smaller pieces.",
  );
}
