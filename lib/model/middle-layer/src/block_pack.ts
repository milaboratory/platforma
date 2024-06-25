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
  registryUrl: string;
  organization: string;
  package: string;
  version: string;
}

/** Information about block origin, can be used to instantiate new blocks */
export type BlockPackSpec = BlockPackDev | BlockPackFromRegistryV1;
