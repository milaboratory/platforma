type ParseResult = {
  error?: Error;
  value?: number;
  cleanInput: string;
};

const NUMBER_REGEX = /^[-−–+]?(\d+)?[.,]?(\d+)?$/; // parseFloat works without errors on strings with multiple dots, or letters in value

function isPartial(v: string) {
  return v === "." || v === "," || v === "-";
}

/**
 * Normalizes a pasted number string by detecting the format and removing thousand separators.
 *
 * Supported formats:
 *   1.222.333,0053  (EU: dot = thousands, comma = decimal)
 *   1,222,333.0053  (US: comma = thousands, dot = decimal)
 *   1 222 333,0053  (space = thousands, comma = decimal)
 *   1 222 333.0053  (space = thousands, dot = decimal)
 */
export function normalizeNumberString(v: string): string {
  v = v.trim();
  v = v.replace(/\s/g, ""); // remove spaces / nbsp (thousand separators)
  v = v.replace("−", "-");
  v = v.replace("–", "-");
  v = v.replace("+", "");

  const dots = (v.match(/\./g) || []).length;
  const commas = (v.match(/,/g) || []).length;

  if (dots > 1 && commas <= 1) {
    // EU: 1.222.333,0053 — dots are thousand separators, comma is decimal
    v = v.replace(/\./g, "");
    v = v.replace(",", ".");
  } else if (commas > 1 && dots <= 1) {
    // US: 1,222,333.0053 — commas are thousand separators, dot is decimal
    v = v.replace(/,/g, "");
  } else if (dots === 1 && commas === 1) {
    // Ambiguous with one of each — last one is the decimal separator
    const lastDot = v.lastIndexOf(".");
    const lastComma = v.lastIndexOf(",");
    if (lastComma > lastDot) {
      // EU: 1.222,05
      v = v.replace(".", "");
      v = v.replace(",", ".");
    } else {
      // US: 1,222.05
      v = v.replace(",", "");
    }
  } else if (commas === 1 && dots === 0) {
    // Single comma — treat as decimal separator
    v = v.replace(",", ".");
  }
  // dots === 1 && commas === 0 — already fine

  return v;
}

function clearNumericValue(v: string) {
  v = v.trim();
  v = v.replace(",", ".");
  v = v.replace("−", "-"); // minus, replacing for the case of input the whole copied value
  v = v.replace("–", "-"); // dash, replacing for the case of input the whole copied value
  v = v.replace("+", "");
  return v;
}

function stringToNumber(v: string) {
  return parseFloat(clearNumericValue(v));
}

function clearInput(v: string): string {
  v = v.trim();

  if (isPartial(v)) {
    return v;
  }

  if (/^-[^0-9.]/.test(v)) {
    return "-";
  }

  const match = v.match(/^(.*)[.,][^0-9].*$/);
  if (match) {
    return match[1] + ".";
  }

  if (v.match(NUMBER_REGEX)) {
    return clearNumericValue(v);
  }

  const n = stringToNumber(v);

  return isNaN(n) ? "" : String(+n);
}

export function parseNumber(
  props: {
    minValue?: number;
    maxValue?: number;
    validate?: (v: number) => string | undefined;
  },
  str: string,
): ParseResult {
  str = str.trim();

  const cleanInput = clearInput(str);

  if (str === "") {
    return {
      value: undefined,
      cleanInput,
    };
  }

  if (!str.match(NUMBER_REGEX)) {
    return {
      error: Error("Value is not a number"),
      cleanInput,
    };
  }

  if (isPartial(str)) {
    return {
      error: Error("Enter a number"),
      cleanInput,
    };
  }

  const value = stringToNumber(str);

  if (isNaN(value)) {
    return {
      error: Error("Value is not a number"),
      cleanInput,
    };
  }

  if (props.minValue !== undefined && value < props.minValue) {
    return {
      error: Error(`Value must be higher than ${props.minValue}`),
      value,
      cleanInput,
    };
  }

  if (props.maxValue !== undefined && value > props.maxValue) {
    return {
      error: Error(`Value must be less than ${props.maxValue}`),
      value,
      cleanInput,
    };
  }

  if (props.validate) {
    const error = props.validate(value);
    if (error) {
      return {
        error: Error(error),
        value,
        cleanInput,
      };
    }
  }

  return {
    value,
    cleanInput,
  };
}
