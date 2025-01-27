import * as d3 from 'd3';
import type { ChartOptions, Scales } from './types';

export function createGridlines(
  svg: d3.Selection<SVGGElement, unknown, null, undefined>,
  options: ChartOptions,
  scales: Scales,
  xTicks: (d: d3.Axis<d3.NumberValue>) => d3.Axis<d3.NumberValue>,
) {
  const { width, height } = options;

  function makeYGridlines() {
    return d3.axisLeft(scales.y) // Use the y-scale for horizontal gridlines
      .ticks(6); // Adjust the number of gridlines
  }

  function makeXGridlines() {
    return xTicks(d3.axisBottom(scales.x));
  }
  // Append horizontal gridlines
  svg.append('g')
    .attr('class', 'grid') // Add a class for styling
    .attr('font-family', '\'Manrope\', sans-serif') // Doesn't work
    .call(makeYGridlines()
      .tickSize(-width) // Extend gridlines across the chart width
      .tickFormat(() => '')); // Remove tick labels

  // Append vertical gridlines
  svg.append('g')
    .attr('class', 'grid') // Add a class for styling
    .attr('font-family', '\'Manrope\', sans-serif')
    .attr('transform', `translate(0,${height})`) // Position at the bottom of the chart
    .call(makeXGridlines()
      .tickSize(-height) // Extend gridlines across the chart height
      .tickFormat(() => '')); // Remove tick labels

  // Style the gridlines using CSS (or inline styles)
  d3.selectAll('.grid line')
    .style('stroke', '#E1E3EB') // Light gray gridlines
    // .style('stroke-dasharray', '2,2') // Dashed gridlines
    .style('opacity', 0.7); // Slightly transparent
}
