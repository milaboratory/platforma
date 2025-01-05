export type Margin = { top: number; right: number; bottom: number; left: number };

export type ChartOptions = {
  width: number;
  height: number;
  margin: Margin;
  nBins?: number;
  yAxisLabel?: string;
  xAxisLabel?: string;
  threshold?: number;
  compact?: boolean;
};

export type Scales = {
  x: d3.ScaleSymLog<number, number, never> | d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number, never>;
};

export type SVG = d3.Selection<SVGGElement, unknown, null, undefined>;

export type CustomBin = {
  from: number;
  to: number;
  weight: number;
};

export type BinLike = {
  x0: number;
  x1: number;
  length: number;
};

export type AnyBin = CustomBin | BinLike;

/**
 * Common case: array of numbers
 */
export type PlChartHistogramBasicSettings = {
  type: 'basic';
  threshold?: number;
  numbers: number[];
  log?: boolean;
  nBins?: number;
};

/**
 * For precalculated bins on log x scale
 */
export type PlChartHistogramLogBinsSettings = {
  type: 'log-bins';
  threshold?: number;
  bins: AnyBin[];
};

export type PlChartHistogramSettings = (
  PlChartHistogramBasicSettings |
  PlChartHistogramLogBinsSettings
) & {
  title?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  // with margins
  totalWidth?: number;
  totalHeight?: number;
  compact?: boolean;
};
