import { gunzipSync, gzipSync } from 'node:zlib';
import canonicalize from 'canonicalize';
import {
  CompileMode,
  FullArtifactName,
  FullArtifactNameWithoutType,
  fullNameWithoutTypeToString,
  parseArtefactNameAndVersion
} from './package';
import { TemplateData } from '@milaboratories/pl-model-backend';

export function parseTemplateContent(content: Uint8Array): TemplateData {
  const data = JSON.parse(decoder.decode(gunzipSync(content))) as TemplateData;
  if (data.type !== 'pl.tengo-template.v2') throw new Error('malformed template');
  return data;
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
      data?: TemplateData;
      content?: Uint8Array;
    }
  ) {
    let { data, content } = body;
    if (data === undefined && content === undefined)
      throw new Error('Neither data nor content is provided for template constructor');
    if (data !== undefined && content !== undefined)
      throw new Error('Both data and content are provided for template constructor');

    if (data === undefined) data = parseTemplateContent(content!);

    if (content === undefined)
      content = gzipSync(encoder.encode(canonicalize(data!)), { chunkSize: 256 * 1024, level: 9 });

    const nameFromData: FullArtifactNameWithoutType = parseArtefactNameAndVersion(data);

    if (
      nameFromData.pkg !== fullName.pkg ||
      nameFromData.id !== fullName.id ||
      nameFromData.version !== fullName.version
    )
      throw new Error(
        `Compiled template name don't match it's package and file names: ${fullNameWithoutTypeToString(nameFromData)} != ${fullNameWithoutTypeToString(fullName)}`
      );

    this.data = data;
    this.content = content;
  }

  toJSON() {
    return { compileMode: this.compileMode, fullName: this.fullName, data: this.data };
  }
}
