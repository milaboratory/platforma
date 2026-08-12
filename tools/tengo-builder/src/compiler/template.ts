import type { CompileMode, FullArtifactName, FullArtifactNameWithoutType } from "./package";
import { fullNameWithoutTypeToString, parseArtefactNameAndVersion } from "./package";
import type { CompiledTemplateV4 } from "@milaboratories/pl-model-backend";
import { parseTemplate, rootTemplate, serializeTemplate } from "@milaboratories/pl-model-backend";

/** Just a holder for template data, compilation options, full name and source code.
 * It mimics ArtifactSource interface.
 */
export type TemplateWithSource = {
  readonly compileMode: CompileMode;
  readonly fullName: FullArtifactName;
  readonly source: string;
  readonly data: CompiledTemplateV4;
};

export function newTemplateWithSource(
  compileMode: CompileMode,
  fullName: FullArtifactName,
  data: CompiledTemplateV4,
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
  readonly data: CompiledTemplateV4;
  readonly content: Uint8Array;
};

export function newTemplateFromData(
  compileMode: CompileMode,
  fullName: FullArtifactName,
  data: CompiledTemplateV4,
): Template {
  validateTemplateName(fullName, data);
  return {
    compileMode,
    fullName,
    data,
    content: serializeTemplate(data),
  };
}

export function newTemplateFromContent(
  compileMode: CompileMode,
  fullName: FullArtifactName,
  content: Uint8Array,
): Template {
  // Only ever called on packs this builder just wrote.
  const data = parseTemplate(content, "zstd");
  if (data.type !== "pl.tengo-template.v4") {
    throw new Error("malformed v4 template");
  }

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
    source: tpl.data.hashToSource[rootTemplate(tpl.data).sourceHash],
  };
}
function validateTemplateName(fullName: FullArtifactName, data: CompiledTemplateV4) {
  const nameFromData: FullArtifactNameWithoutType = parseArtefactNameAndVersion(rootTemplate(data));

  if (
    nameFromData.pkg !== fullName.pkg ||
    nameFromData.id !== fullName.id ||
    nameFromData.version !== fullName.version
  )
    throw new Error(
      `Compiled template name don't match it's package and file names: ` +
        `${fullNameWithoutTypeToString(nameFromData)} != ${fullNameWithoutTypeToString(fullName)}`,
    );
}
