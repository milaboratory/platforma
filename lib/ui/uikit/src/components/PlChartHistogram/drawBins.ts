import type { BinLike, ChartOptions, Scales, SVG } from './types';
import * as d3 from 'd3';

export function drawBins(
  svg: SVG,
  bins: BinLike[],
  dimension: ChartOptions,
  scales: Scales,
) {
  const { height } = dimension;

  const { x, y } = scales;

  const tooltip = d3
    .select('body')
    .append('div')
    .attr('class', 'svg-tooltip')
    .style('position', 'absolute')
    .style('visibility', 'hidden');

  // Three function that change the tooltip when user hover / move / leave a cell
  const mouseover = function (_event: MouseEvent, d: BinLike) {
    tooltip
      .style('visibility', 'visible')
      .text(`count: ${d.length}\nx0: ${d.x0}\nx1: ${d.x1}`);
  };

  const mousemove = function (event: MouseEvent) {
    tooltip
      .style('top', event.pageY - 10 + 'px')
      .style('left', event.pageX + 10 + 'px');
  };

  const mouseout = function () {
    tooltip.style('visibility', 'hidden');
  };

  // Add rectangles for the histogram bars
  svg.selectAll('rect')
    .data(bins)
    .enter()
    .append('rect')
    .attr('x', (d) => x(d.x0!)) // Position the bar based on the bin start
    .attr('y', (d) => y(d.length)) // Height based on bin count
    .attr('width', (d) => x(d.x1!) - x(d.x0!)) // Bar width based on logarithmic intervals
    .attr('height', (d) => height - y(d.length)) // Invert height to fit SVG coordinate system
    .style('fill', '#929BAD')
    .attr('stroke', '#fff') // Border color
    .attr('stroke-opacity', 0.2)
    .attr('stroke-width', 0.5)
    .on('mouseover', mouseover)
    .on('mousemove', mousemove)
    .on('mouseout', mouseout)
    .append('title').text((d) => `[${d.x0}, ${d.x1}]\n` + d.length + '\n'); // Set bar color
}
