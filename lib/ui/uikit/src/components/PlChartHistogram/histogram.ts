import * as d3 from 'd3';
import { createSvgContainer } from './createSvgContainer';
import { drawBins } from './drawBins';
import { createGridlines } from './createGridlines';
import { logspace } from './logspace';
import { createLabels } from './createLabels';
import type { AnyBin, BinLike, ChartOptions } from './types';
import { drawThreshold } from './drawThreshold';
import { normalizeBins } from './normalizeBins';

const gx = (svg: d3.Selection<SVGGElement, unknown, null, undefined>, height: number) => {
  return svg.append('g')
    .style('font-size', '14px')
    .style('font-weight', '500')
    .attr('transform', `translate(0,${height})`);
};

const gy = (svg: d3.Selection<SVGGElement, unknown, null, undefined>) => {
  return svg.append('g')
    .style('font-size', '14px')
    .style('font-weight', '500');
};

const createYScale = (bins: BinLike[], height: number) => {
  return d3.scaleLinear()
    .domain([0, d3.max(bins, (d) => d.length)!]) // Max bin count for the domain
    .range([height, 0]); // Map to chart height (invert to match SVG coordinates)
};

export function createHistogramLinear(el: HTMLElement, options: ChartOptions, data: number[]) {
  const { width, height, nBins = 10 } = options;

  const svg = createSvgContainer(el, options);

  const min = d3.min(data) as number;
  const max = d3.max(data) as number;

  const x = d3.scaleLinear()
    .domain([min, max])
    .range([0, width]);

  const bins: BinLike[] = normalizeBins(d3.bin()
    .domain(x.domain() as [number, number]) // Set the input domain to match the x-scale
    .thresholds(x.ticks(nBins))(data)); // Apply the data to create bins

  const y = createYScale(bins, height);

  createGridlines(svg, options, { x, y }, (x) => x.ticks(6));

  drawBins(svg, bins, options, { x, y });

  drawThreshold(svg, { x, y }, options);

  gx(svg, height).call(d3.axisBottom(x).tickSize(0));

  gy(svg).call(d3.axisLeft(y).tickSize(0));

  createLabels(svg, options);
}

export function createHistogramLog(el: HTMLElement, options: ChartOptions, data: number[]) {
  const { width, height, nBins = 10 } = options;

  const svg = createSvgContainer(el, options);

  const min = d3.min(data) as number;
  const max = d3.max(data) as number;

  const x = d3.scaleSymlog()
    .domain([min, max]) // Input range (min and max values of the data)
    .range([0, width])
    .nice() // Output range (width of the chart)
    ;

  const createThresholds = (n: number) => {
    const res = [];

    for (let i = 0; i <= n; i++) {
      res.push(Number(x.invert(width * (i / n)).toFixed(2)));
    }

    return res;
  };

  const bins = normalizeBins(d3.bin()
    .domain(x.domain() as [number, number]) // Set the input domain to match the x-scale
    .thresholds(createThresholds(nBins))(data)); // Apply the data to create bins

  const y = createYScale(bins, height);

  const tickValues = logspace(0, Math.ceil(Math.log10(max)), 6);

  createGridlines(svg, options, { x, y }, (x) => x.tickValues(tickValues));

  drawBins(svg, bins, options, { x, y });

  drawThreshold(svg, { x, y }, options);

  gx(svg, height).call(d3.axisBottom(x).tickValues(tickValues).tickSize(0));

  gy(svg).call(d3.axisLeft(y).tickSize(0));

  createLabels(svg, options);
}

export function createHistogramFromBins(el: HTMLElement, options: ChartOptions, _bins: AnyBin[]) {
  const { width, height } = options;

  const svg = createSvgContainer(el, options);

  const bins = normalizeBins(_bins);

  const min = d3.min(bins, (b) => b.x0) as number;
  const max = d3.max(bins, (b) => b.x1) as number;

  const x = d3.scaleSymlog()
    .domain([min, max])
    .range([0, width])
    .nice();

  const y = createYScale(bins, height);

  const tickValues = logspace(0, Math.ceil(Math.log10(max)), 6);

  createGridlines(svg, options, { x, y }, (x) => x.tickValues(tickValues));

  drawBins(svg, bins, options, { x, y });

  drawThreshold(svg, { x, y }, options);

  gx(svg, height).call(d3.axisBottom(x).tickValues(tickValues).tickSize(0));

  gy(svg).call(d3.axisLeft(y).tickSize(0));

  createLabels(svg, options);
}
