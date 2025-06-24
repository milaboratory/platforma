import type { ColorSchemeOption } from './types';

export const defaultSettings = {
  colorScheme: { type: 'chemical-properties' } as ColorSchemeOption,
  consensus: true,
  seqLogo: true,
  legend: true,
};

export type Settings = typeof defaultSettings;
