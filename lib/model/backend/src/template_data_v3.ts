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
}

export interface CompiledTemplateV3 {
  /** Discriminator for future use */
  type: 'pl.tengo-template.v3';

  /** Hashes of all artifacts to sources itself. */
  hashToSource: Record<string, string>;

  template: TemplateDataV3;
}
