import { SynchronizedTreeOps, SynchronizedTreeState } from '@milaboratory/pl-tree';
import { Computable } from '@milaboratory/computable';

export type TemporalSynchronizedTreeOps = Pick<
  SynchronizedTreeOps,
  'pollingInterval' | 'stopPollingDelay'
>;

export interface TreeAndComputable<T, ST extends T = T> {
  tree: SynchronizedTreeState;
  computable: Computable<T, ST>;
}

/** Helper type to express a TreeAndComputable with computable
 * with standard non-undefined-stable type signature. */
export type TreeAndComputableU<T> = TreeAndComputable<T | undefined, T>;
