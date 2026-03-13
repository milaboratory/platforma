export type ParseResult =
  | { value: number; error?: undefined }
  | { value?: undefined; error: string }
  | { value?: undefined; error?: undefined };

/**
 * Detect locale format and normalize to a plain number string.
 * Handles:
 *   555.555.555,100  (EU: dot = thousands, comma = decimal)
 *   555,555,555.100  (US: comma = thousands, dot = decimal)
 *   555 555 555,100  (space = thousands, comma = decimal)
 *   555 555 555.100  (space = thousands, dot = decimal)
 *   123,45 / 123.45  (single separator = decimal)
 */
function normalizeNumberFormat(v: string): string {
  v = v.replace(/\s/g, "");
  v = v.replace("−", "-").replace("–", "-").replace("+", "");

  const dots = (v.match(/\./g) || []).length;
  const commas = (v.match(/,/g) || []).length;

  if (dots > 1 && commas <= 1) {
    // EU: 1.222.333,0053
    v = v.replace(/\./g, "").replace(",", ".");
  } else if (commas > 1 && dots <= 1) {
    // US: 1,222,333.0053
    v = v.replace(/,/g, "");
  } else if (dots === 1 && commas === 1) {
    if (v.lastIndexOf(",") > v.lastIndexOf(".")) {
      // EU: 1.222,05
      v = v.replace(".", "").replace(",", ".");
    } else {
      // US: 1,222.05
      v = v.replace(",", "");
    }
  } else if (commas === 1 && dots === 0) {
    v = v.replace(",", ".");
  }
  // dots === 1 && commas === 0 — already fine

  return v;
}

/**
 * Try to parse a string as a number using locale-aware rules.
 *
 * Returns:
 *   { value } — successfully parsed
 *   { error } — clearly invalid input
 *   {}        — empty or partial input (no error, no value)
 */
export function tryParseNumber(str: string): ParseResult {
  str = str.trim();
  if (str === "") return {};

  const v = normalizeNumberFormat(str);

  // Partial input: just sign, just dot, sign+dot — not an error yet
  if (/^-?\.*$/.test(v)) return {};

  if (/^-?(\d+\.?\d*|\.\d+)$/.test(v)) {
    const n = parseFloat(v);
    return isNaN(n) ? { error: "Value is not a number" } : { value: n };
  }

  return { error: "Value is not a number" };
}

/**
 * Normalizes a pasted number string.
 * Strips all non-numeric characters first, then resolves locale format.
 */
export function normalizePastedNumber(v: string): string {
  v = v.trim().replace(/[^\d.,\-−–+\s]/g, "");
  return normalizeNumberFormat(v);
}

export function validateNumber(
  value: number,
  props: {
    minValue?: number;
    maxValue?: number;
    validate?: (v: number) => string | undefined;
  },
): string | undefined {
  if (props.minValue !== undefined && value < props.minValue) {
    return `Value must be higher than ${props.minValue}`;
  }
  if (props.maxValue !== undefined && value > props.maxValue) {
    return `Value must be less than ${props.maxValue}`;
  }
  return props.validate?.(value);
}
