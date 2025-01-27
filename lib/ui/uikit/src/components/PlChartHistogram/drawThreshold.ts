import type { ChartOptions, Scales, SVG } from './types';

export function drawThreshold(svg: SVG, scales: Scales, options: ChartOptions) {
  const { threshold } = options;

  if (!threshold) {
    return;
  }

  svg
    .append('line')
    .attr('x1', scales.x(threshold))
    .attr('x2', scales.x(threshold))
    .attr('y1', 0)
    .attr('y2', options.height)
    .style('stroke', '#F05670')
    .style('stroke-width', '1')
    .style('stroke-dasharray', '7.4 3.2');
}
