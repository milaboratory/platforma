import type { ChartOptions, Scales } from "./types";
import type { Selection } from "d3-selection";
import type { Axis } from "d3-axis";
import type { NumberValue } from "d3-scale";
import { selectAll } from "d3-selection";
import { axisBottom, axisLeft } from "d3-axis";

export function createGridlines(
  svg: Selection<SVGGElement, unknown, null, undefined>,
  options: ChartOptions,
  scales: Scales,
  xTicks: (d: Axis<NumberValue>) => Axis<NumberValue>,
) {
  const { width, height } = options;

  function makeYGridlines() {
    return axisLeft(scales.y) // Use the y-scale for horizontal gridlines
      .ticks(6); // Adjust the number of gridlines
  }

  function makeXGridlines() {
    return xTicks(axisBottom(scales.x));
  }
  // Append horizontal gridlines
  svg
    .append("g")
    .attr("class", "grid") // Add a class for styling
    .attr("font-family", "'Manrope', sans-serif") // Doesn't work
    .call(
      makeYGridlines()
        .tickSize(-width) // Extend gridlines across the chart width
        .tickFormat(() => ""),
    ); // Remove tick labels

  // Append vertical gridlines
  svg
    .append("g")
    .attr("class", "grid") // Add a class for styling
    .attr("font-family", "'Manrope', sans-serif")
    .attr("transform", `translate(0,${height})`) // Position at the bottom of the chart
    .call(
      makeXGridlines()
        .tickSize(-height) // Extend gridlines across the chart height
        .tickFormat(() => ""),
    ); // Remove tick labels

  // Style the gridlines using CSS (or inline styles)
  selectAll(".grid line")
    .style("stroke", "#E1E3EB") // Light gray gridlines
    // .style('stroke-dasharray', '2,2') // Dashed gridlines
    .style("opacity", 0.7); // Slightly transparent
}
