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

  /**
   * Backend capability tokens this template (and its transitively-imported
   * sub-templates) requires to run. Populated by `tengo-builder` at compile
   * time:
   *   - `CapabilityWasm` ("wasm:v1") is added when a wasm artifact is
   *     embedded (via `assets.importWasm`, directly or through a library).
   *   - Child templates contribute their own `requiredCapabilities` —
   *     unioned transitively, so the top template carries the full set.
   *
   * Consumers (`block-tools pack`, `pl-middle-layer` install gate,
   * `pl-middle-layer` catalog listing) read this directly; the recursive
   * tree walk that previously rediscovered the same fact at every
   * consumer is gone. Tokens are the same vocabulary the backend
   * advertises in `MaintenanceAPI.Ping.Response.capabilities` — see
   * `./capabilities.ts`.
   */
  requiredCapabilities?: string[];
}

export interface CompiledTemplateV3 {
  /** Discriminator for future use */
  type: "pl.tengo-template.v3";

  /** Hashes of all artifacts to sources itself. */
  hashToSource: Record<string, string>;

  template: TemplateDataV3;
}
