import { categoricalColors, type CategoricalColor } from './palette';

/**
 * Represents a color with red, green, blue, and alpha channels.
 * Provides methods to convert to HEX and RGBA formats.
 *
 * @param {number} r - Red channel (0-255).
 * @param {number} g - Green channel (0-255).
 * @param {number} b - Blue channel (0-255).
 * @param {number} [a=1] - Alpha channel (0-1).
 */
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

Color.categorical = (name: CategoricalColor) => {
  return Color.fromHex(categoricalColors[name]);
};
