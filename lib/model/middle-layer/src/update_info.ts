import { BlockPackSpec } from './block_registry';

/** Communicates possible block update options */
export type BlockUpdateInfo = {
  /** Possible update changing major version register */
  major?: BlockPackSpec;

  /** Possible update keeping the same major version */
  minor?: BlockPackSpec;

  /** Possible update keeping the same minor and major version */
  patch?: BlockPackSpec;
};
