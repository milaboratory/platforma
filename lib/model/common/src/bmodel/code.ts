import type { BlockCodeFeatureFlags } from '../flags';

export type Code = {
  type: 'plain';
  content: string;
};

export type BlockCodeWithInfo = {
  readonly code: Code;
  readonly sdkVersion: string;
  readonly featureFlags: BlockCodeFeatureFlags | undefined;
};
