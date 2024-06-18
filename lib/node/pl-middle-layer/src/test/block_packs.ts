import { BlockPackSpecNotPrepared } from '../model/block_pack_spec';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';

export const TestSecret = 'secret';

export const TestBPPreparer = new BlockPackPreparer(TestSecret);

export const BPSpecEnterV041NotPrepared: BlockPackSpecNotPrepared = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.1'
};

export const BPSpecSumV042NotPrepared: BlockPackSpecNotPrepared = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/sum-numbers/0.4.2'
};
