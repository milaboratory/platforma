const BYTE_UNITS = [
  'B',
  'kB',
  'MB',
  'GB',
  'TB',
  'PB',
  'EB',
  'ZB',
  'YB',
];

const BIBYTE_UNITS = [
  'B',
  'kiB',
  'MiB',
  'GiB',
  'TiB',
  'PiB',
  'EiB',
  'ZiB',
  'YiB',
];

const BIT_UNITS = [
  'b',
  'kbit',
  'Mbit',
  'Gbit',
  'Tbit',
  'Pbit',
  'Ebit',
  'Zbit',
  'Ybit',
];

const BIBIT_UNITS = [
  'b',
  'kibit',
  'Mibit',
  'Gibit',
  'Tibit',
  'Pibit',
  'Eibit',
  'Zibit',
  'Yibit',
];

type Options = {
  bits?: boolean;
  binary?: boolean;
  signed?: boolean;
  locale?: string;
};

/*
Formats the given number using `Number#toLocaleString`.
- If locale is a string, the value is expected to be a locale-key (for example: `de`).
- If locale is true, the system default locale is used for translation.
- If no value for locale is specified, the number is returned unmodified.
*/
const toLocaleString = (number: number, locale: string | undefined) => {
  let result = String(number);
  if (typeof locale === 'string' || Array.isArray(locale)) {
    result = number.toLocaleString(locale);
  } else if (locale === true) {
    result = number.toLocaleString(undefined);
  }

  return result;
};

export function prettyBytes(number: number | bigint, options: Options) {
  number = typeof number === 'bigint' ? Number(number) : number;

  if (!Number.isFinite(number)) {
    throw new TypeError(`Expected a finite number, got ${typeof number}: ${number}`);
  }

  Object.assign(options, {
    bits: false,
    binary: false,
  });

  const UNITS = options.bits
    ? (options.binary ? BIBIT_UNITS : BIT_UNITS)
    : (options.binary ? BIBYTE_UNITS : BYTE_UNITS);

  if (options.signed && number === 0) {
    return ` 0 ${UNITS[0]}`;
  }

  const isNegative = number < 0;
  const prefix = isNegative ? '-' : (options.signed ? '+' : '');

  if (isNegative) {
    number = -number;
  }

  let localeOptions;

  if (number < 1) {
    const numberString = toLocaleString(number, options.locale);
    return prefix + numberString + ' ' + UNITS[0];
  }

  const exponent = Math.min(Math.floor(options.binary ? Math.log(number) / Math.log(1024) : Math.log10(number) / 3), UNITS.length - 1);
  number /= (options.binary ? 1024 : 1000) ** exponent;

  if (!localeOptions) {
    number = Number(number.toPrecision(3));
  }

  const numberString = toLocaleString(Number(number), options.locale);

  const unit = UNITS[exponent];

  return prefix + numberString + ' ' + unit;
}
