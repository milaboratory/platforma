import type { ColorScheme } from './types';

export const defaultSettings = {
  colorScheme: 'chemical-properties' as ColorScheme,
  consensus: true,
  seqLogo: true,
  legend: true,
};

export type Settings = typeof defaultSettings;
