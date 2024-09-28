import { RegistrySpec } from '@milaboratories/pl-model-middle-layer';

export const CentralBlockRegistry: RegistrySpec = {
  type: 'remote-v2',
  url: 'https://blocks.pl-open.science/releases'
};

export const V1CentralRegistry: RegistrySpec = {
  type: 'remote-v1',
  url: 'https://block.registry.platforma.bio/releases'
};

export const V1CentralDevSnapshotRegistry: RegistrySpec = {
  type: 'remote-v1',
  url: 'https://block.registry.platforma.bio/dev'
};
