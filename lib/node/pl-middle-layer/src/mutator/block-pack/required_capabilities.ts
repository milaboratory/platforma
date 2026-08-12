import { decompressTemplate } from "@milaboratories/pl-model-backend";
import type { AnyCompiledTemplate, TemplateCodec } from "@milaboratories/pl-model-backend";

/**
 * Reads the capability tokens a template declares it requires via
 * `TemplateNodeV4.requiredCapabilities` (populated by `tengo-builder` at
 * compile time).
 *
 * Use this on the install path: `BlockPackPreparer.prepare` parses the
 * workflow off-thread via the worker, and the parsed result feeds
 * straight into this function — no second gunzip+JSON.parse on the main
 * thread, no recursive walk to re-derive what the compiler already wrote
 * down.
 *
 * Reads both v3 and v4. v3 must stay supported: every block published
 * before v4 carries its requirements in a v3 pack, and treating those as
 * "no requirements" would let a WASM block install on a backend that
 * cannot run it.
 *
 * Returns `undefined` for v2 templates (no compile-time capability field)
 * and for templates that declare no requirements; otherwise the array as
 * the compiler wrote it.
 */
export function requiredCapabilitiesFromTemplate(
  parsed: AnyCompiledTemplate,
): string[] | undefined {
  switch (parsed.type) {
    case "pl.tengo-template.v4":
      return parsed.hashToTemplate[parsed.template]?.requiredCapabilities;
    case "pl.tengo-template.v3":
      return parsed.template.requiredCapabilities;
    default:
      return undefined;
  }
}

/**
 * Same lookup, starting from raw pack bytes and the codec they were stored
 * under. Used only at catalog-listing time for local-dev blocks where the
 * worker pipeline isn't in play (`block_registry/registry.ts`). Install paths
 * go through `requiredCapabilitiesFromTemplate` instead to avoid parsing the
 * workflow twice.
 */
export function deriveRequiredCapabilities(
  workflowContent: Uint8Array | Buffer,
  codec: TemplateCodec,
): string[] | undefined {
  let parsed: unknown;
  try {
    const json = decompressTemplate(workflowContent, codec).toString("utf-8");
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  return requiredCapabilitiesFromTemplate(parsed as AnyCompiledTemplate);
}
