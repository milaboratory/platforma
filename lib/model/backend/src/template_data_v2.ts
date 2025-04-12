export interface TemplateLibData {
  /** i.e. @milaboratory/some-package:lib1 */
  name: string;
  /** i.e. 1.2.3 */
  version: string;
  /** full source code */
  src: string;
}

export interface TemplateSoftwareData {
  /** i.e. @milaboratory/mixcr:main */
  name: string;
  /** i.e. 4.2.3 */
  version: string;
  /** full contents of software dependency description */
  src: string;
}

export interface TemplateAssetData {
  /** i.e. @milaboratory/mixcr:main */
  name: string;
  /** i.e. 4.2.3 */
  version: string;
  /** full contents of asset dependency description */
  src: string;
}

export interface TemplateData {
  /** Discriminator for future use */
  type: 'pl.tengo-template.v2';

  /** i.e. @milaboratory/some-package:template */
  name: string;
  /** i.e. 1.2.3 */
  version: string;

  /**
   * Custom hash token of the template for deduplication purposes. Can be set with 'hash_override' compiler option.
   * Dangerous! Remember: great power comes with great responsibility.
   */
  hashOverride?: string;

  /** i.e. @milaboratory/some-package:some-lib -> normalized library source code */
  libs: Record<string, TemplateLibData>;
  /** i.e. @milaboratory/some-package:some-lib -> to nested template data */
  templates: Record<string, TemplateData>;
  /** i.e. @milaboratory/mixcr:main -> software metadata */
  software: Record<string, TemplateSoftwareData>;
  /** i.e. @milaboratory/genome:human -> asset metadata */
  assets: Record<string, TemplateAssetData>;
  /** Template source code */
  src: string;
}
