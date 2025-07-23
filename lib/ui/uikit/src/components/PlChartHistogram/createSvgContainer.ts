import type { ChartOptions } from './types';
import { select } from 'd3-selection';

export function createSvgContainer(el: HTMLElement, options: ChartOptions) {
  const { width, height, margin, compact } = options;

  el.replaceChildren();

  if (compact) {
    el.style.height = height + 'px';
    el.style.lineHeight = height + 'px';
  }

  const svg = select(el) // Append the SVG element to the body
    .append('svg')
    .attr('width', width + margin.left + margin.right) // Set the total width
    .attr('height', height + margin.top + margin.bottom) // Set the total height
    .append('g') // Append a group to handle margins
    .attr('transform', `translate(${margin.left},${margin.top})`);

  return svg;
}
