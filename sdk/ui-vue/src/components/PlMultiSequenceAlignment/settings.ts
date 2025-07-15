import type { PlMultiSequenceAlignmentSettings } from '@platforma-sdk/model';
import { defaultAlignmentParams } from './multi-sequence-alignment';

export const defaultSettings: PlMultiSequenceAlignmentSettings = {
  colorScheme: { type: 'chemical-properties' },
  widgets: ['seqLogo', 'consensus', 'legend'],
  alignmentParams: defaultAlignmentParams,
};
