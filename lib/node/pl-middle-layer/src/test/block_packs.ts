import { BlockPackSpecNotPrepared } from '../model/block_pack_spec';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';

export const TestSecret = 'secret';

export const TestBPPreparer = new BlockPackPreparer(TestSecret);

export const BPSpecEnterV040NotPrepared: BlockPackSpecNotPrepared = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.0'
};

export const BPSpecSumV040NotPrepared: BlockPackSpecNotPrepared = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/sum-numbers/0.4.0'
};
