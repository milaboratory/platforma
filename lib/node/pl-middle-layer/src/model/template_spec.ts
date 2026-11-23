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
  /** The pack file `content` was read from, for local dev blocks. */
  localPath?: string;
}

export interface PreparedTemplate {
  readonly type: "prepared";
  data: TemplateData | CompiledTemplateV3;
}

/** A registry pack not yet downloaded: the backend installs it from `url`, or the client does. */
export interface RegistryPackTemplate {
  readonly type: "registry-pack";
  url: string;
  /** Lowercase hex sha256 of the gzipped pack, from the registry manifest. */
  sha256: string;
}

/** A local dev pack: the backend installs it from an upload, or the client reads it. */
export interface LocalPackTemplate {
  readonly type: "local-pack";
  path: string;
  /** Lowercase hex sha256 of the gzipped pack file. */
  sha256: string;
}

/** A pack the backend can install with TengoTemplateInstall. */
export type InstallablePackTemplate = RegistryPackTemplate | LocalPackTemplate;

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
