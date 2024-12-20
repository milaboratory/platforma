type Data = Int8Array | Uint8Array | Uint8ClampedArray | ArrayBuffer;

function toDataView(data: Data) {
  if (data instanceof Int8Array || data instanceof Uint8Array || data instanceof Uint8ClampedArray)
    return new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (data instanceof ArrayBuffer) return new DataView(data);

  throw new TypeError(
    'Expected `data` to be an ArrayBuffer, Buffer, Int8Array, Uint8Array or Uint8ClampedArray'
  );
}

interface Options {
  /** If set, forcefully enable or disable padding. The default behavior is to follow the default of the selected variant. */
  padding?: boolean;
}

const RFC4648 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RFC4648_HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function base32Encode(
  data: Data,
  variant: 'RFC3548' | 'RFC4648' | 'RFC4648-HEX' | 'Crockford',
  options?: Options
) {
  options = options || {};
  let alphabet, defaultPadding;

  switch (variant) {
    case 'RFC3548':
    case 'RFC4648':
      alphabet = RFC4648;
      defaultPadding = true;
      break;
    case 'RFC4648-HEX':
      alphabet = RFC4648_HEX;
      defaultPadding = true;
      break;
    case 'Crockford':
      alphabet = CROCKFORD;
      defaultPadding = false;
      break;
    default:
      throw new Error('Unknown base32 variant: ' + variant);
  }

  const padding = options.padding !== undefined ? options.padding : defaultPadding;
  const view = toDataView(data);

  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < view.byteLength; i++) {
    value = (value << 8) | view.getUint8(i);
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];

  if (padding)
    while (output.length % 8 !== 0) {
      output += '=';
    }

  return output;
}
