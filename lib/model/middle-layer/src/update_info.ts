import { BlockPackSpec } from './block_registry';

/** Communicates possible block update option */
export type UpdateSuggestion<V = BlockPackSpec> = {
  type: 'major' | 'minor' | 'patch';
  update: V;
};

/** Communicates possible block update options */
export type UpdateSuggestions<V = BlockPackSpec> = UpdateSuggestion<V>[];
