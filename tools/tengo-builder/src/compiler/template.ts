import { gunzipSync, gzipSync } from 'node:zlib';
import canonicalize from 'canonicalize';
import {
  CompileMode,
  FullArtifactName,
  FullArtifactNameWithoutType,
  fullNameWithoutTypeToString,
  parseArtefactNameAndVersion
} from './package';

export interface TemplateLibData {
  /** i.e. @milaboratory/some-package:lib1 */
  name: string;
  /** i.e. 1.2.3 */
  version: string;
  /** full source code */
  src: string,
}

export interface TemplateSoftwareData {
  /** i.e. @milaboratory/mixcr:main */
  name: string;
  /** i.e. 4.2.3 */
  version: string;
  /** full contents of software dependency description */
  src: string,
}

export interface TemplateAssetData {
  /** i.e. @milaboratory/mixcr:main */
  name: string;
  /** i.e. 4.2.3 */
  version: string;
  /** full contents of asset dependency description */
  src: string,
}

export interface TemplateData {
  /** Discriminator for future use */
  type: 'pl.tengo-template.v2';

  /** i.e. @milaboratory/some-package:template */
  name: string;
  /** i.e. 1.2.3 */
  version: string;

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

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class Template {
  public readonly data: TemplateData;
  public readonly content: Uint8Array;

  constructor(
    public readonly compileMode: CompileMode,
    public readonly fullName: FullArtifactName,
    body: {
      data?: TemplateData,
      content?: Uint8Array
    }
  ) {
    let { data, content } = body;
    if (data === undefined && content === undefined)
      throw new Error('Neither data nor content is provided for template constructor');
    if (data !== undefined && content !== undefined)
      throw new Error('Both data and content are provided for template constructor');

    if (data === undefined) {
      data = JSON.parse(decoder.decode(gunzipSync(content!))) as TemplateData;
      if (data.type !== 'pl.tengo-template.v2')
        throw new Error('malformed template');
    }

    if (content === undefined)
      content = gzipSync(encoder.encode(canonicalize(data!)));

    const nameFromData: FullArtifactNameWithoutType = parseArtefactNameAndVersion(data);

    if (nameFromData.pkg !== fullName.pkg || nameFromData.id !== fullName.id || nameFromData.version !== fullName.version)
      throw new Error(`Compiled template name don't match it's package and file names: ${fullNameWithoutTypeToString(nameFromData)} != ${fullNameWithoutTypeToString(fullName)}`);

    this.data = data;
    this.content = content;
  }

  toJSON() {
    return { compileMode: this.compileMode, fullName: this.fullName, data: this.data }
  }
}
