export interface TemplateFromRegistry {
  readonly type: 'from-registry';
  registry: string;
  path: string;
}

export interface ExplicitTemplate {
  readonly type: 'explicit';
  content: Uint8Array;
}

export interface TemplateFromFile {
  readonly type: 'from-file';
  path: string;
}

export type TemplateSpecPrepared = TemplateFromRegistry | ExplicitTemplate;
export type TemplateSpecAny = TemplateSpecPrepared | TemplateFromFile;
