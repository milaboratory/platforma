import type { PObjectId } from '@platforma-sdk/model';

export type ColorSchemeOption =
  | { type: 'no-color' }
  | { type: 'chemical-properties' }
  | { type: 'markup'; columnId: PObjectId };

export type ColorScheme = {
  type: ColorSchemeOption['type'];
  colors: ColorMap;
};

export type ColorMap = Record<string, { label: string; color: string }>;

export type ResidueCounts = Record<string, number>[];
