import type {
  CompileMode,
  FullArtifactName,
  FullArtifactNameWithoutType,
} from './package';
import {
  fullNameWithoutTypeToString,
  parseArtefactNameAndVersion,
} from './package';
import type { CompiledTemplateV3 } from '@milaboratories/pl-model-backend';
import {
  parseCompiledTemplateV3,
  serializeCompiledTemplateV3,
} from '@milaboratories/pl-model-backend';

/** Just a holder for template data, compilation options, full name and source code.
 * It mimics ArtifactSource interface.
 */
export type TemplateWithSource = {
  readonly compileMode: CompileMode;
  readonly fullName: FullArtifactName;
  readonly source: string;
  readonly data: CompiledTemplateV3;
};

export function newTemplateWithSource(
  compileMode: CompileMode,
  fullName: FullArtifactName,
  data: CompiledTemplateV3,
  source: string,
): TemplateWithSource {
  validateTemplateName(fullName, data);

  return {
    compileMode,
    fullName,
    data,
    source,
  };
}

export type Template = {
  readonly compileMode: CompileMode;
  readonly fullName: FullArtifactName;
  readonly data: CompiledTemplateV3;
  readonly content: Uint8Array;
};

export function newTemplateFromData(
  compileMode: CompileMode,
  fullName: FullArtifactName,
  data: CompiledTemplateV3,
): Template {
  validateTemplateName(fullName, data);
  return {
    compileMode,
    fullName,
    data,
    content: serializeCompiledTemplateV3(data),
  };
}

export function newTemplateFromContent(
  compileMode: CompileMode,
  fullName: FullArtifactName,
  content: Uint8Array,
): Template {
  const data = parseCompiledTemplateV3(content);
  validateTemplateName(fullName, data);
  return {
    compileMode,
    fullName,
    data,
    content,
  };
}

export function templateToSource(tpl: Template): TemplateWithSource {
  return {
    compileMode: tpl.compileMode,
    fullName: tpl.fullName,
    data: tpl.data,
    source: tpl.data.hashToSource[tpl.data.template.sourceHash],
  };
}
function validateTemplateName(fullName: FullArtifactName, data: CompiledTemplateV3) {
  const nameFromData: FullArtifactNameWithoutType = parseArtefactNameAndVersion(data.template);

  if (
    nameFromData.pkg !== fullName.pkg
    || nameFromData.id !== fullName.id
    || nameFromData.version !== fullName.version
  )
    throw new Error(
      `Compiled template name don't match it's package and file names: `
      + `${fullNameWithoutTypeToString(nameFromData)} != ${fullNameWithoutTypeToString(fullName)}`,
    );
}
