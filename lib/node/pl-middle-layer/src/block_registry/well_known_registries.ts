import type { RegistrySpec } from './registry_spec';

export const CentralRegistry: RegistrySpec = {
  type: 'remote_v1',
  label: 'Central Release Registry',
  url: 'https://block.registry.platforma.bio/releases'
};

export const CentralDevSnapshotRegistry: RegistrySpec = {
  type: 'remote_v1',
  label: 'Central Dev Snapshot registry',
  url: 'https://block.registry.platforma.bio/dev'
};
