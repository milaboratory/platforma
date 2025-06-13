let defs: SVGDefsElement | null = null;
const registeredRaw = new Map<string, string>();

function ensureSpriteContainer() {
  if (defs) return;

  defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  defs.style.display = 'none';

  document.body.prepend(defs);
}

export function registerSvg(raw: string): string {
  if (!registeredRaw.has(raw)) {
    const id = `svg-${registeredRaw.size}`;
    registeredRaw.set(raw, id);

    ensureSpriteContainer();

    const widthMatch = raw.match(/width="(\d+)(px)?"/);
    const heightMatch = raw.match(/height="(\d+)(px)?"/);
    const viewBoxMatch = raw.match(/viewBox="([^"]+)"/);
    const width = widthMatch?.[1] ?? 16;
    const height = heightMatch?.[1] ?? 16;
    const viewBox = viewBoxMatch?.[1] ?? `0 0 ${width} ${height}`;

    const symbolString = raw
      .replace(/^<svg[^>]*>/, `<svg id="${id}" viewBox="${viewBox}">`)
      .replace(/<\/svg>\s*$/, '</svg>');

    const template = document.createElement('template');
    template.innerHTML = symbolString;

    const symbol = template.content.firstElementChild;
    if (symbol && defs) {
      defs.appendChild(symbol);
    }
  }

  return registeredRaw.get(raw)!;
}
