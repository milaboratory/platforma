import { gunzipSync, gzipSync } from 'node:zlib';
import canonicalize from 'canonicalize';

/*
  Package "@milaboratory/current-tengo-package".

  Structure:

  src/
    local-template.pl.tengo  <- this one will be compiled and put into ./dist/tengo/tpl/local-template.pl.pkg
    local-library.tengo      <- this one will be normalized and put into ./dist/tengo/lib/local-library.tengo
    main.tpl.tengo           <- this one will be compiled into ./dist/tengo/tpl/main.pl.pkg and published by external tool

  Code of "main.tpl.tengo":

  getTemplate("@milaboratory/some-tengo-template") // -> getTemplate("@milaboratory/some-tengo-template:main")
  getTemplate(":local-template") // -> getTemplate("@milaboratory/current-tengo-package:local-template")
  import("@milaboratory/some-tengo-library") // -> import("@milaboratory/some-tengo-library:main")
  import(":local-library") // -> import("@milaboratory/current-tengo-package:local-library")

 */

export type ArtefactType = 'library' | 'template'

/** Artefact ID including package version */
export interface FullArtefactId {
  /** Dependency type */
  type: ArtefactType;

  /** Fully qualified package */
  pkg: string;

  /** Name (path) of the artefact inside the package */
  name: string;

  /** Package version */
  version: string;
}

export type ArtefactId = Pick<FullArtefactId, 'type' | 'pkg' | 'name'>;

export type PackageId = Pick<FullArtefactId, 'pkg' | 'version'>;

export function artefactKey(id: ArtefactId) {
  return `${id.type}||${id.pkg}||${id.name}`;
}

export class ArtefactSource {
  constructor(
    /** Full artefact id, including package version */
    public readonly id: FullArtefactId,
    /** Normalized source code */
    public readonly src: string,
    /** List of dependencies */
    public readonly dependencies: ArtefactId[]) {
  }
}

export interface TemplateData {
  /** Discriminator for future use */
  type: 'pl.tengo-template.v2';

  /** i.e. @milaboratory/some-package:template:1.2.3 */
  name: string;
  /** i.e. @milaboratory/some-package:some-lib -> normalized library source code */
  libs: Record<string, string>;
  /** i.e. @milaboratory/some-package:some-lib -> to nested template data */
  templates?: Record<string, TemplateData>;
  /** Template source code */
  src: string;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class Template {
  private _data?: TemplateData;
  private _content?: Uint8Array;

  constructor(public readonly id: FullArtefactId,
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
