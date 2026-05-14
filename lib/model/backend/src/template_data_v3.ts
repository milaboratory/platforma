export interface TemplateLibDataV3 {
  /** i.e. @milaboratory/some-package:lib1 */
  name: string;
  /** i.e. 1.2.3 */
  version: string;
  /** hash of the source code */
  sourceHash: string;
}

export interface TemplateSoftwareDataV3 {
  /** i.e. @milaboratory/mixcr:main */
  name: string;
  /** i.e. 4.2.3 */
  version: string;
  /** hash of the source code */
  sourceHash: string;
}

export interface TemplateAssetDataV3 {
  /** i.e. @milaboratory/mixcr:main */
  name: string;
  /** i.e. 4.2.3 */
  version: string;
  /** hash of the full contents of asset dependency description */
  sourceHash: string;
}

export interface TemplateWasmDataV3 {
  /** i.e. @milaboratories/pframes-rs-wasip2:main */
  name: string;
  /** i.e. 0.0.0 */
  version: string;
  /** sha256 of the base64-encoded wasm bytes stored in hashToSource */
  sourceHash: string;
}

export interface TemplateDataV3 {
  /** i.e. @milaboratory/some-package:template */
  name: string;
  /** i.e. 1.2.3 */
  version: string;

  /** Hash of the source from the `sources` field. */
  sourceHash: string;

  /**
   * Custom hash token of the template for deduplication purposes. Can be set with 'hash_override' compiler option.
   * Dangerous! Remember: great power comes with great responsibility.
   */
  hashOverride?: string;

  /** i.e. @milaboratory/some-package:some-lib -> the library source code */
  libs: Record<string, TemplateLibDataV3>;
  /** i.e. @milaboratory/some-package:some-template -> the nested template source code */
  templates: Record<string, TemplateDataV3>;
  /** i.e. @milaboratory/mixcr:main -> the software metadata */
  software: Record<string, TemplateSoftwareDataV3>;
  /** i.e. @milaboratory/genome:human -> the asset metadata */
  assets: Record<string, TemplateAssetDataV3>;
  /** i.e. @milaboratories/pframes-rs-wasip2:main -> the wasm component metadata.
   * The actual wasm bytes are base64-encoded and stored under sourceHash in the
   * parent CompiledTemplateV3.hashToSource map. */
  wasm?: Record<string, TemplateWasmDataV3>;
}

export interface CompiledTemplateV3 {
  /** Discriminator for future use */
  type: "pl.tengo-template.v3";

  /** Hashes of all artifacts to sources itself. */
  hashToSource: Record<string, string>;

  template: TemplateDataV3;
}

/** Returns true if a v3 template tree (or any nested fragment) carries
 * a non-empty `wasm` map. Recursion descends into `templates`, so wasm
 * deps in transitively-imported sub-templates are detected too.
 *
 * Single source of truth for "does this template require wasm?". Used by
 * `block-tools` pack-time detection and by `pl-middle-layer` install-time
 * gating — keeping the two in sync avoids a class of bug where a block
 * embedding wasm could slip past the install gate (or vice versa) after
 * a template-format change applied to only one copy. */
export function templateHasWasm(tpl: TemplateDataV3): boolean {
  if (tpl.wasm && Object.keys(tpl.wasm).length > 0) return true;
  for (const sub of Object.values(tpl.templates)) {
    if (templateHasWasm(sub)) return true;
  }
  return false;
}
