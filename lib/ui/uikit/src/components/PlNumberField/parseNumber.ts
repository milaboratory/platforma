/**
 * Strict number parser. No locale guessing, no normalization.
 * Non-canonical forms (leading zeros, trailing dots, etc.) are accepted —
 * formatting to canonical form happens on blur/enter in the component.
 *
 * Input/output table (covers ~90% of real cases):
 *
 * | Input               | Result                          | Reason                          |
 * |---------------------|---------------------------------|---------------------------------|
 * | ""                  | {}                              | empty                           |
 * | "-"                 | {}                              | partial                         | apply blur/enter format
 * | "."                 | {}                              | partial                         | apply blur/enter format
 * | "-."                | {}                              | partial                         | apply blur/enter format
 * | "123."              | { value: 123 }                  | trailing dot                    | apply blur/enter format
 * | "1e"                | { value: 1 }                    | partial exp → 1e+0              | apply blur/enter format
 * | "1e-"               | { value: 1 }                    | partial exp → 1e-0              | apply blur/enter format
 * | "1e+"               | { value: 1 }                    | partial exp → 1e+0              | apply blur/enter format
 * | "123"               | { value: 123 }                  | exact match                     |
 * | "-5"                | { value: -5 }                   | exact match                     |
 * | "0.5"               | { value: 0.5 }                  | exact match                     |
 * | "0.0000000001"      | { value: 1e-10 }                | decimal form matches            |
 * | "1e-5"              | { value: 0.00001 }              | exponential notation            | apply blur/enter format
 * | "2e+10"             | { value: 2e10 }                 | exponential notation            | apply blur/enter format
 * | ".5"                | { value: 0.5 }                  | not canonical                   | apply blur/enter format
 * | "01"                | { value: 1 }                    | leading zero                    | apply blur/enter format
 * | "1.0"               | { value: 1 }                    | trailing zero                   | apply blur/enter format
 * | "1.10"              | { value: 1.1 }                  | trailing zero                   | apply blur/enter format
 * | "+5"                | { value: 5 }                    | unnecessary plus                | apply blur/enter format
 * | "1,5"               | { error: "...separator..." }    | comma instead of dot            |
 * | "1.232,111"         | { error: "...separator..." }    | EU locale format                |
 * | "1.237.62"          | { error: "...separator..." }    | multiple dots (EU thousands)    |
 * | "555.555.555,100"   | { error: "...separator..." }    | EU locale format                |
 * | "1,222,333.05"      | { error: "...separator..." }    | US locale format                |
 * | "abc"               | { error: "not a number" }       | letters                         |
 * | "12abc"             | { error: "not a number" }       | letters mixed in                |
 * | "1.237.asdf62"      | { error: "not a number" }       | letters mixed in                |
 * | "9007199254740993"  | { error: "precision..." }       | integer exceeds safe range      |
 * | "0.1234567890123456789" | { error: "precision..." }    | too many digits for float64     |
 */

export type ParseResult =
  | { value: number; error?: undefined }
  | { value?: undefined; error: string }
  | { value?: undefined; error?: undefined };

const EXP_RE = /^-?\d+(\.\d+)?e[+-]?\d+$/i;
const EXP_PARTIAL_RE = /^-?\d+(\.\d+)?e[+-]?$/i;

/** "-", ".", "-." — NaN for Number() but clearly in-progress typing */
function isPartialInput(str: string): boolean {
  return str === "-" || str === "." || str === "-.";
}

/**
 * Normalize a decimal string by removing cosmetic differences:
 * leading +, leading zeros, trailing zeros after decimal, trailing dot.
 * Used to compare user input with canonical float representation.
 */
function normalizeDecimalString(s: string): string {
  let sign = "";
  if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  // Remove leading zeros (keep one before decimal point)
  s = s.replace(/^0+(?=\d)/, "");
  if (s.startsWith(".")) s = "0" + s;

  // Remove trailing zeros after decimal point, then trailing dot
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }

  if (s === "" || s === "0") return "0";

  return sign + s;
}

/** Complete partial exponential: "1e" → "1e+0", "1e-" → "1e-0", "1e+" → "1e+0" */
function completeExponential(str: string): string {
  if (/e$/i.test(str)) return str + "+0";
  if (/e[+-]$/i.test(str)) return str + "0";
  return str;
}

export function tryParseNumber(str: string): ParseResult {
  str = str.trim();
  if (str === "") return {};
  if (isPartialInput(str)) return {};

  // Exponential notation (full or partial)
  if (EXP_RE.test(str) || EXP_PARTIAL_RE.test(str)) {
    const completed = completeExponential(str);
    const n = Number(completed);
    if (!Number.isFinite(n)) return { error: "Value is not a number" };
    return { value: n };
  }

  const n = Number(str);
  if (!Number.isFinite(n)) {
    // Only digits, dots, commas, sign, spaces → likely a locale/format issue
    if (/^[-+]?[\d.,\s]+$/.test(str)) {
      return { error: "Use dot as decimal separator, e.g. 3.14" };
    }
    return { error: "Value is not a number" };
  }

  // Precision loss: input has more precision than float64 can represent
  const canonical = numberToDecimalString(n);
  const normalized = normalizeDecimalString(str);
  if (normalized !== canonical) {
    return { error: `Precision exceeded, actual value: ${canonical}` };
  }

  return { value: n };
}

/**
 * Converts a number to a plain decimal string (no exponential notation).
 * E.g. 1e-7 → "0.0000001", 2e+21 → "2000000000000000000000"
 */
export function numberToDecimalString(n: number | undefined): string {
  if (n === undefined) return "";
  const s = String(n);
  if (!s.includes("e") && !s.includes("E")) return s;
  try {
    return n.toFixed(20).replace(/\.?0+$/, "");
  } catch {
    return s;
  }
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
