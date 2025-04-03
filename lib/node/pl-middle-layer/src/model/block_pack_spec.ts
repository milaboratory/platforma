import type { ExplicitTemplate, UnpackedTemplate } from './template_spec';
import type { ResourceType } from '@milaboratories/pl-client';
import type { BlockConfigContainer } from '@platforma-sdk/model';
import type { BlockPackSpec } from '@milaboratories/pl-model-middle-layer';

export type FrontendSpec = FrontendFromUrl | FrontendFromFolder;

export interface FrontendFromUrlData {
  url: string;
}

export const FrontendFromUrlResourceType: ResourceType = { name: 'Frontend/FromUrl', version: '1' };

/** Directs user of the block pack to download the contents from the URL
 * outside the pl infrastructure. */
export interface FrontendFromUrl extends FrontendFromUrlData {
  type: 'url';
}

export interface FrontendFromFolderData {
  path: string;
  /** HMAC signature of the path using local secret encoded as hex. */
  signature: string;
}

export const FrontendFromFolderResourceType: ResourceType = {
  name: 'Frontend/FromFolder',
  version: '1',
};

/** Directs user of the block pack to load frontend from specific local
 * folder. Signature allows to confirm that this is the same client who
 * added the resource. */
export interface FrontendFromFolder extends FrontendFromFolderData {
  type: 'local';
}

/** Direct instructions to create block-pack from client. Currently, this
 * is the only block-pack spec that can be directly materialized. */
export interface BlockPackExplicit {
  type: 'explicit';
  template: ExplicitTemplate;
  config: BlockConfigContainer;
  frontend: FrontendSpec;
  source: BlockPackSpec;
}

/** Block-pack spec that can be materialized in pl. */
export type BlockPackUnpacked = {
  type: 'unpacked';
  template: UnpackedTemplate;
  config: BlockConfigContainer;
  frontend: FrontendSpec;
  source: BlockPackSpec;
};

export type BlockPackSpecPrepared = BlockPackUnpacked;

/** All block-pack specs. */
export type BlockPackSpecAny = BlockPackSpecPrepared | BlockPackExplicit | BlockPackSpec;
