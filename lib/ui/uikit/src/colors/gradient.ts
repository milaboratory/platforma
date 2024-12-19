import type { Palette } from './palette';
import { palettes } from './palette';
import { Color } from './color';

export type GradientSource = (string | Color)[] | Palette;

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

/**
 * Parses a color string (attention: currently supports only HEX, @todo)
 */
Color.fromString = (str: string) => {
  if (str.startsWith('#')) {
    return Color.fromHex(str);
  }

  throw Error('TODO: implement rgb(a), hsl');
};

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * Interpolates between two colors.
 *
 * @param {Color} color1 - Start color.
 * @param {Color} color2 - End color.
 * @param {number} t - Interpolation factor [0, 1].
 * @returns {Color} Interpolated color.
 */
export function interpolateColor(color1: Color, color2: Color, t: number): Color {
  const r = Math.round(lerp(color1.r, color2.r, t));
  const g = Math.round(lerp(color1.g, color2.g, t));
  const b = Math.round(lerp(color1.b, color2.b, t));
  return Color(r, g, b);
}

/**
 * Normalizes a gradient definition into an array of Color objects.
 *
 * @param {GradientSource} raw - A gradient defined as an array of strings, Colors, or a Palette.
 * @returns {Color[]} Array of normalized Color objects.
 */
export function normalizeGradient(raw: GradientSource): Color[] {
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

/**
 * Creates a gradient with utilities to sample or split colors.
 */
export function Gradient(gradient: GradientSource) {
  return new class {
    constructor(public readonly colors: Color[]) {}

    /**
     * Samples a color at a specific point in the gradient.
     *
     * @param {number} t - A value in [0, 1] representing the position in the gradient.
     */
    fromInterval(t: number) {
      if (t < 0) throw new Error('t must be greater than or equal to 0');
      if (t > 1) throw new Error('t must be less than or equal to 1');

      const colors = this.colors;

      const segments = colors.length - 1;

      const segment = Math.floor(t * segments);

      const localT = (t * segments) % 1; // Local t within the current segment

      const color1 = colors[segment];
      const color2 = colors[Math.min(segment + 1, segments)];

      return interpolateColor(color1, color2, localT);
    }

    /**
     * Gets the nth color in a gradient divided into segments.
     *
     * @param {number} n - Index of the color (1-based).
     * @param {number} segments - Total number of segments.
     */
    getNthOf(n: number, segments: number) {
      if (n <= 0) throw new Error('n must be greater than 0');
      if (n > segments) throw Error('n must be lower or equal than count of segments');
      return this.fromInterval((n - 1) / (segments - 1));
    }

    /**
     * Splits the gradient into n evenly spaced colors.
     */
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
