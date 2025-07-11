import { uniqueId } from '@milaboratories/helpers';

declare global {
  interface Window {
    SvgRegistryRawSvgMap: Map<string, SvgMeta>;
    SvgRegistryDefsElement: SVGDefsElement;
  }
}

function createSpriteContainer() {
  const defsElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defsElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  defsElement.style.display = 'none';
  document.body.prepend(defsElement);
  return defsElement;
}

// prevent multiple definitions of the same SVG registry in different builds
window.SvgRegistryRawSvgMap = window.SvgRegistryRawSvgMap ?? new Map<string, SvgMeta>();
window.SvgRegistryDefsElement = window.SvgRegistryDefsElement ?? createSpriteContainer();

export type SvgMeta = {
  spriteId: string;
  defaultWidth: number;
  defaultHeight: number;
};

const registeredRaw = window.SvgRegistryRawSvgMap;
const defsElement = window.SvgRegistryDefsElement;

export function registerSvg(raw: string, name?: string): SvgMeta {
  if (!registeredRaw.has(raw)) {
    const id = `svg-${name ? `${name}-` : ''}${uniqueId(16)}`;

    const widthMatch = raw.match(/width="(\d+)(px)?"/)?.[1];
    const heightMatch = raw.match(/height="(\d+)(px)?"/)?.[1];
    const viewBoxParts = raw.match(/viewBox="[-+]?\d*\.?\d+(?:e[-+]?\d+)?"/);
    const viewBoxWidthMatch = viewBoxParts?.[2];
    const viewBoxHeightMatch = viewBoxParts?.[3];
    let width = Number(viewBoxWidthMatch ?? widthMatch ?? 16);
    width = isNaN(width) ? 16 : width;
    let height = Number(viewBoxHeightMatch ?? heightMatch ?? 16);
    height = isNaN(height) ? 16 : height;
    const viewBox = `0 0 ${width} ${height}`;

    // Parse the original SVG tag and preserve all its attributes except id and viewBox
    const svgTagMatch = raw.match(/^<svg([^>]*)>/i);
    let svgAttributes = svgTagMatch ? svgTagMatch[1] : '';
    // Remove any existing id or viewBox attributes
    svgAttributes = svgAttributes
      .replace(/\s*id\s*=\s*(['"])[^'"]*\1/gi, '')
      .replace(/\s*viewBox\s*=\s*(['"])[^'"]*\1/gi, '');

    let fillIdx = 0;
    let strokeIdx = 0;
    const preparedSvg = raw
      .replace(/^<svg[^>]*>/i, `<svg id="${id}" viewBox="${viewBox}" ${svgAttributes}>`)
      .replace(/<\/svg>\s*$/, '</svg>')
      .replace(
        /\bfill\s*=\s*(['"])(.*?)\1/gi,
        (_, q, value) =>
          /^(none|transparent)$/i.test(value)
            ? `fill=${q}${value}${q}`
            : `fill=${q}var(--svg-fill-${fillIdx++}, ${value})${q}`,
      )
      .replace(
        /\bstroke\s*=\s*(['"])(.*?)\1/gi,
        (_, q, value) =>
          /^(none|transparent)$/i.test(value)
            ? `stroke=${q}${value}${q}`
            : `stroke=${q}var(--svg-stroke-${strokeIdx++}, ${value})${q}`,
      );

    const template = document.createElement('template');
    template.innerHTML = preparedSvg;

    const symbol = template.content.firstElementChild;
    if (symbol && defsElement) {
      defsElement.appendChild(symbol);
    }

    registeredRaw.set(raw, {
      spriteId: id,
      defaultWidth: width,
      defaultHeight: height,
    });
  }

  return registeredRaw.get(raw)!;
}
