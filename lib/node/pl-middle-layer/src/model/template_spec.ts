import type { CompiledTemplateV3, TemplateData } from '@milaboratories/pl-model-backend';

export interface TemplateFromRegistry {
  readonly type: 'from-registry';
  registry: string;
  path: string;
}

export interface ExplicitTemplate {
  readonly type: 'explicit';
  content: Uint8Array;
}

export interface PreparedTemplate {
  readonly type: 'prepared';
  data: TemplateData | CompiledTemplateV3;
}

export interface TemplateFromFile {
  readonly type: 'from-file';
  path: string;
}

export type TemplateSpecPrepared = TemplateFromRegistry | ExplicitTemplate | PreparedTemplate;
export type TemplateSpecAny = TemplateSpecPrepared | TemplateFromFile;
