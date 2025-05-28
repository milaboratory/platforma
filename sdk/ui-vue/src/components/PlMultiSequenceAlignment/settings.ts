import type { ColorScheme } from './types';

export const defaultSettings = {
  colorScheme: { type: 'no-color' } as ColorScheme,
  consensus: true,
  seqLogo: true,
  legend: true,
};

export type Settings = typeof defaultSettings;
