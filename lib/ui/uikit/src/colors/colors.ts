import type { Palette } from './palette';
import { palettes } from './palette';

export function Color(r: number, g: number, b: number, a: number = 1) {
  return new class {
    constructor(
      public readonly r: number,
      public readonly g: number,
      public readonly b: number,
      public readonly a: number = 1,
    ) {}

    get hex() {
      const hexR = r.toString(16).padStart(2, '0');
      const hexG = g.toString(16).padStart(2, '0');
      const hexB = b.toString(16).padStart(2, '0');
      const hexA = Math.round(a * 255).toString(16).padStart(2, '0'); // Alpha in 2-digit hex

      return `#${hexR}${hexG}${hexB}${hexA}`;
    }

    get rgba() {
      return `rgb(${r}, ${g}, ${b}, ${a})`;
    }

    toString() {
      return this.hex;
    }

    toJSON() {
      return this.hex;
    }
  }(r, g, b, a);
}

export type Color = ReturnType<typeof Color>;

type RawGradient = (string | Color)[] | Palette;

Color.fromHex = (hex: string): Color => {
  hex = hex.replace('#', '');

  let r: number, g: number, b: number, a: number = 1;

  if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    throw new Error('Invalid HEX color format.');
  }

  return Color(r, g, b, a);
};

Color.fromString = (str: string) => {
  if (str.startsWith('#')) {
    return Color.fromHex(str);
  }

  throw Error('TODO: implement rgb(a), hsl');
};

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

export function interpolateColor(color1: Color, color2: Color, t: number): Color {
  const r = Math.round(lerp(color1.r, color2.r, t));
  const g = Math.round(lerp(color1.g, color2.g, t));
  const b = Math.round(lerp(color1.b, color2.b, t));
  return Color(r, g, b);
}

export function normalizeGradient(raw: RawGradient): Color[] {
  if (typeof raw === 'string') {
    return palettes[raw].map((it) => Color.fromString(it));
  }

  return raw.map((it) => {
    if (typeof it === 'string') {
      return Color.fromString(it);
    }

    return it;
  });
}

export function Gradient(gradient: RawGradient) {
  return new class {
    constructor(public readonly colors: Color[]) {}

    /**
     *
     * @param t number [0, 1]
     * @returns
     */
    fromInterval(t: number) {
      const colors = this.colors;

      const segments = colors.length - 1;

      const segment = Math.floor(t * segments);

      const localT = (t * segments) % 1; // Local t within the current segment

      const color1 = colors[segment];
      const color2 = colors[Math.min(segment + 1, segments)];

      return interpolateColor(color1, color2, localT);
    }

    takeNthOf(n: number, segments: number) {
      if (n <= 0) throw new Error('n must be greater than 0');
      if (n > segments) throw Error('n must be lower or equal than count of segments');
      return this.fromInterval((n - 1) / (segments - 1));
    }

    split(n: number) {
      if (n <= 0) throw new Error('n must be greater than 0');

      const colors: Color[] = [];

      for (let i = 0; i < n; i++) {
        const t = i / (n - 1); // Normalize t to [0, 1]
        colors.push(this.fromInterval(t));
      }

      return colors;
    }
  }(normalizeGradient(gradient));
}
