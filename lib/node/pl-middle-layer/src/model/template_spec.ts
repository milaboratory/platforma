import type { TemplateData } from '@milaboratories/pl-model-backend';

export interface TemplateFromRegistry {
  readonly type: 'from-registry';
  registry: string;
  path: string;
}

export interface ExplicitTemplate {
  readonly type: 'explicit';
  content: Uint8Array;
}

export interface UnpackedTemplate {
  readonly type: 'unpacked';
  data: TemplateData;
}

export interface TemplateFromFile {
  readonly type: 'from-file';
  path: string;
}

export type TemplateSpecPrepared = TemplateFromRegistry | ExplicitTemplate | UnpackedTemplate;
export type TemplateSpecAny = TemplateSpecPrepared | TemplateFromFile;
