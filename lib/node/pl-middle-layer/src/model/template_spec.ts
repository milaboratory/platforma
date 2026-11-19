import type { SignedResourceId } from "@milaboratories/pl-client";
import type { CompiledTemplateV3, TemplateData } from "@milaboratories/pl-model-backend";

export interface TemplateFromRegistry {
  readonly type: "from-registry";
  registry: string;
  path: string;
}

export interface ExplicitTemplate {
  readonly type: "explicit";
  content: Uint8Array;
}

export interface PreparedTemplate {
  readonly type: "prepared";
  data: TemplateData | CompiledTemplateV3;
}

/**
 * A block registry pack the client has not downloaded: the backend installs it from `url`, or the
 * client downloads it when the backend cannot.
 */
export interface RegistryPackTemplate {
  readonly type: "registry-pack";
  url: string;
  /** Lowercase hex sha256 of the gzipped pack, from the registry manifest. */
  sha256: string;
}

export interface CachedTemplate {
  readonly type: "cached";
  readonly resourceId: SignedResourceId;
}

export interface TemplateFromFile {
  readonly type: "from-file";
  path: string;
}

export type TemplateSpecPrepared =
  | TemplateFromRegistry
  | ExplicitTemplate
  | PreparedTemplate
  | CachedTemplate;
export type TemplateSpecAny = TemplateSpecPrepared | TemplateFromFile;
