import type { Color } from '@/colors';

export type StakedBarSegment = {
  value: number;
  label: string;
  description?: string;
  color: string | Color;
};

export type PlChartStackedBarSettings = {
  data: StakedBarSegment[];
  maxLegendsInColumn?: number; // default is 5
};
