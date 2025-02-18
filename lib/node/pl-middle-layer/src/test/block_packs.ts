import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import { HmacSha256Signer } from '@milaboratories/ts-helpers';
import type { BlockPackSpec } from '@milaboratories/pl-model-middle-layer';
import { V2RegistryProvider } from '../block_registry/registry-v2-provider';
import { defaultHttpDispatcher } from '@milaboratories/pl-http';

export const TestBPPreparer = new BlockPackPreparer(
  new V2RegistryProvider(defaultHttpDispatcher()),
  new HmacSha256Signer(HmacSha256Signer.generateSecret()),
);

export const BPSpecEnterV041NotPrepared: BlockPackSpec = {
  type: 'from-registry-v1',
  registryUrl: 'https://block.registry.platforma.bio/releases',
  id: {
    organization: 'milaboratory',
    name: 'enter-numbers',
    version: '0.5.0',
  },
};

export const BPSpecSumV042NotPrepared: BlockPackSpec = {
  type: 'from-registry-v1',
  registryUrl: 'https://block.registry.platforma.bio/releases',
  id: {
    organization: 'milaboratory',
    name: 'sum-numbers',
    version: '0.5.0',
  },
};
