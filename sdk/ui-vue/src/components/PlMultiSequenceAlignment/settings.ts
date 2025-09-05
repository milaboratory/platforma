import type { PlMultiSequenceAlignmentSettings } from '@platforma-sdk/model';

export const defaultSettings: PlMultiSequenceAlignmentSettings = {
  colorScheme: { type: 'chemical-properties' },
  widgets: ['seqLogo', 'consensus', 'legend'],
  alignmentParams: { gpo: 5.5, gpe: 2.0, tgpe: 1.0 },
};
