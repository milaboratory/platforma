/** Block pack from local folder, to be used during block development. Legacy layout. */
export interface BlockPackDevV1 {
  type: 'dev' | 'dev-v1';
  folder: string;
  mtime?: string;
}

/** Block pack from local folder, to be used during block development. New layout. */
export interface BlockPackDevV2 {
  type: 'dev-v2';
  folder: string;
  mtime?: string;
}

/** Block pack from registry with version 1 layout, to be loaded directly
 * from the client. */
export interface BlockPackFromRegistryV1 {
  type: 'from-registry-v1';
  registryUrl: string;
  organization: string;
  package: string;
  version: string;
}

/** Information about block origin, can be used to instantiate new blocks */
export type BlockPackSpec =
  | BlockPackDevV1
  | BlockPackDevV2
  | BlockPackFromRegistryV1;
