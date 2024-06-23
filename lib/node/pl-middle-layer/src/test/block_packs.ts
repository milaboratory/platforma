import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import { HmacSha256Signer } from '@milaboratory/ts-helpers';
import { BlockPackSpec } from '@milaboratory/sdk-model';

export const TestBPPreparer = new BlockPackPreparer(new HmacSha256Signer(HmacSha256Signer.generateSecret()));

export const BPSpecEnterV041NotPrepared: BlockPackSpec = {
  type: 'from-registry-v1',
  registryUrl: 'https://block.registry.platforma.bio/releases',
  organization: 'milaboratory',
  package: 'enter-numbers',
  version: '0.5.0'
};

export const BPSpecSumV042NotPrepared: BlockPackSpec = {
  type: 'from-registry-v1',
  registryUrl: 'https://block.registry.platforma.bio/releases',
  organization: 'milaboratory',
  package: 'sum-numbers',
  version: '0.5.0'
};
