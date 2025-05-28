import type { PObjectId } from '@platforma-sdk/model';

export type SequenceRow = {
  labels: string[];
  sequences: string[];
  annotations: Annotation[];
};

export type ColorScheme = {
  type: 'chemical-properties';
} | {
  type: 'no-color';
} | {
  type: 'annotation';
  columnId: PObjectId;
};

export type ResidueCounts = Record<string, number>[];

export type Annotation = {
  id: string;
  start: number;
  length: number;
};
