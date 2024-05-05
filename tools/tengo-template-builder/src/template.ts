import { gunzipSync, gzipSync } from 'node:zlib';
import canonicalize from 'canonicalize';
import { FullArtifactName } from './package';

export interface TemplateLibData {
  /** i.e. @milaboratory/some-package:lib1 */
  name: string;
  /** i.e. 1.2.3 */
  version: string;
  /** full source code */
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
  /** Template source code */
  src: string;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class Template {
  private _data?: TemplateData;
  private _content?: Uint8Array;

  constructor(public readonly fullName: FullArtifactName,
              body: {
                data?: TemplateData,
                content?: Uint8Array
              }) {
    if (body.data === undefined && body.content === undefined)
      throw new Error('Neither data nor content is provided for template constructor');
    if (body.data !== undefined && body.content !== undefined)
      throw new Error('Both data and content are provided for template constructor');
    this._data = body.data;
    this._content = body.content;
  }

  get data(): TemplateData {
    if (this._data !== undefined)
      return this._data;

    this._data = JSON.parse(decoder.decode(gunzipSync(this._content!))) as TemplateData;
    if (this._data.type !== 'pl.tengo-template.v2')
      throw new Error('malformed template');

    return this._data;
  }

  get content(): Uint8Array {
    if (this._content !== undefined)
      return this._content;

    this._content = gzipSync(encoder.encode(canonicalize(this._data!)));

    return this._content;
  }
}
