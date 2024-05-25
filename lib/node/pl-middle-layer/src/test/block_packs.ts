import { BlockPackSpec } from '../model/block_pack_spec';
import {
  TplSpecEnterExplicit,
  TplSpecEnterFromRegistry,
  TplSpecSumExplicit,
  TplSpecSumFromRegistry
} from './known_templates';

export const BPSpecEnterExplicit: BlockPackSpec = {
  type: 'custom',
  template: TplSpecEnterExplicit
};

export const BPSpecEnterFromRegistry: BlockPackSpec = {
  type: 'custom',
  template: TplSpecEnterFromRegistry
};

export const BPSpecSumExplicit: BlockPackSpec = {
  type: 'custom',
  template: TplSpecSumExplicit
};

export const BPSpecSumFromRegistry: BlockPackSpec = {
  type: 'custom',
  template: TplSpecSumFromRegistry
};
