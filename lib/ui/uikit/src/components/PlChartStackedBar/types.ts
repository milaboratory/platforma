import type { Color } from '@/colors';

export type PlChartStackedBarSegment = {
  value: number;
  label: string;
  description?: string;
  color: string | Color;
};

export type PlChartStackedBarSettings = {
  /**
   * The title of the chart.
   * This will be displayed at the top of the chart, if provided.
   */
  title?: string;

  /**
   * The data to be displayed in the chart.
   * Each entry represents a segment of a stacked bar.
   */
  data: PlChartStackedBarSegment[];

  /**
   * The maximum number of legends displayed in a single column.
   * Defaults to 5 if not specified.
   */
  maxLegendsInColumn?: number;

  /**
   * Whether to show legends for the chart.
   * Defaults to `true` if not specified.
   */
  showLegends?: boolean;
};
