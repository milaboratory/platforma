import type * as d3 from 'd3';
import type { ChartOptions } from './types';

export function createLabels(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  options: ChartOptions,
) {
  const { height, width, margin, xAxisLabel, yAxisLabel, compact } = options;

  if (compact) {
    return;
  }

  // X-axis label
  svg.append('text')
    .attr('class', 'x-axis-label')
    .attr('font-weight', 500)
    .attr('text-anchor', 'middle') // Center the text
    .attr('x', width / 2) // Center horizontally
    .attr('y', height + margin.bottom - 5) // Position below the X-axis
    .text(xAxisLabel ?? 'Value Range'); // Set your custom label text

  // Y-axis label
  svg.append('text')
    .attr('class', 'y-axis-label')
    .attr('font-weight', 500)
    .attr('text-anchor', 'middle') // Center the text
    .attr('x', -height / 2) // Center vertically (rotated axis)
    .attr('y', -margin.left + 15) // Position to the left of the Y-axis
    .attr('transform', 'rotate(-90)') // Rotate text 90 degrees counter-clockwise
    .text(yAxisLabel ?? 'Frequency'); // Set your custom label text
}
