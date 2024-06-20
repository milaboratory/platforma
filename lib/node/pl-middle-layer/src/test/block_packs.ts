import { BlockPackSpecNotPrepared } from '../model';
import { BlockPackPreparer } from '../mutator/block-pack/block_pack';
import { HmacSha256Signer } from '@milaboratory/ts-helpers';

export const TestBPPreparer = new BlockPackPreparer(new HmacSha256Signer(HmacSha256Signer.generateSecret()));

export const BPSpecEnterV041NotPrepared: BlockPackSpecNotPrepared = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.4.1'
};

export const BPSpecSumV042NotPrepared: BlockPackSpecNotPrepared = {
  type: 'from-registry-v1',
  url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/sum-numbers/0.4.2'
};
