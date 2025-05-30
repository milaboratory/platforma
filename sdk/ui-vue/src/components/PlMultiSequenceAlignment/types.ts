export type SequenceRow = {
  labels: string[];
  sequence: string;
};

export type ColorScheme = 'chemical-properties' | 'no-color';

export type ResidueCounts = Record<string, number>[];
