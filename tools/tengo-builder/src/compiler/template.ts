import type {
  CompileMode,
  FullArtifactName,
  FullArtifactNameWithoutType,
} from './package';
import {
  fullNameWithoutTypeToString,
  parseArtefactNameAndVersion,
} from './package';
import type { TemplateData } from '@milaboratories/pl-model-backend';
import {
  parseTemplate,
  serializeTemplate,
} from '@milaboratories/pl-model-backend';

export class Template {
  public readonly data: TemplateData;
  public readonly content: Uint8Array;

  constructor(
    public readonly compileMode: CompileMode,
    public readonly fullName: FullArtifactName,
    body: {
      data?: TemplateData;
      content?: Uint8Array;
    },
  ) {
    let { data, content } = body;
    if (data === undefined && content === undefined)
      throw new Error('Neither data nor content is provided for template constructor');
    if (data !== undefined && content !== undefined)
      throw new Error('Both data and content are provided for template constructor');

    if (data === undefined) data = parseTemplate(content!);

    if (content === undefined)
      content = serializeTemplate(data);

    const nameFromData: FullArtifactNameWithoutType = parseArtefactNameAndVersion(data);

    if (
      nameFromData.pkg !== fullName.pkg
      || nameFromData.id !== fullName.id
      || nameFromData.version !== fullName.version
    )
      throw new Error(
        `Compiled template name don't match it's package and file names: ${fullNameWithoutTypeToString(nameFromData)} != ${fullNameWithoutTypeToString(fullName)}`,
      );

    this.data = data;
    this.content = content;
  }

  toJSON() {
    return { compileMode: this.compileMode, fullName: this.fullName, data: this.data };
  }
}
