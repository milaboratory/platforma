import { ExplicitTemplate } from './template';
import { ResourceType } from '@milaboratory/pl-client-v2';
import { BlockConfig } from '@milaboratory/sdk-ui';

/** Block pack from local folder, to be used during block development. */
export interface BlockPackDev {
  type: 'dev';
  folder: string;
  mtime?: string;
}

/** Block pack from registry with version 1 layout, to be loaded directly
 * from the client. */
export interface BlockPackFromRegistryV1 {
  type: 'from-registry-v1';
  url: string;
}

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

export const FrontendFromFolderResourceType: ResourceType = { name: 'Frontend/FromFolder', version: '1' };

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
  config: BlockConfig;
  frontend: FrontendSpec;
  source: BlockPackSource;
}

/** Information about block pack source persisted in block pack resource */
export type BlockPackSource = BlockPackDev | BlockPackFromRegistryV1;

/** Block-pack spec that can be materialized in pl. */
export type BlockPackSpecPrepared = BlockPackExplicit;

/** Block-pack spec requiring preparation (conversion) before being materialized. */
export type BlockPackSpecNotPrepared = BlockPackDev | BlockPackFromRegistryV1;

/** All block-pack specs. */
export type BlockPackSpecAny = BlockPackSpecPrepared | BlockPackSpecNotPrepared;
