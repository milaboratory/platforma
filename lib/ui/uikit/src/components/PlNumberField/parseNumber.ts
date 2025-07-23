type ParseResult = {
  error: Error;
  value?: number;
} | {
  error?: undefined;
  value: number | undefined;
};

const NUMBER_REGEX = /^[-−–+]?(\d+)?[\\.,]?(\d+)?$/; // parseFloat works without errors on strings with multiple dots, or letters in value

function isPartial(v: string) {
  return v === '.' || v === ',' || v === '-';
}

function stringToNumber(v: string) {
  v = v.trim();

  if (isPartial(v)) {
    return 0;
  }

  let forParsing = v;
  forParsing = forParsing.replace(',', '.');
  forParsing = forParsing.replace('−', '-'); // minus, replacing for the case of input the whole copied value
  forParsing = forParsing.replace('–', '-'); // dash, replacing for the case of input the whole copied value
  forParsing = forParsing.replace('+', '');
  return parseFloat(forParsing);
}

export function cleanInput(v: string): string {
  v = v.trim();

  if (isPartial(v)) {
    return v;
  }

  if (v.match(NUMBER_REGEX)) {
    return v;
  }

  const n = stringToNumber(v);

  return isNaN(n) ? '' : String(+n);
}

export function parseNumber(props: {
  minValue?: number;
  maxValue?: number;
  validate?: (v: number) => string | undefined;
}, str: string): ParseResult {
  str = str.trim();

  if (str === '') {
    return {
      value: undefined,
    };
  }

  if (!str.match(NUMBER_REGEX)) {
    return {
      error: Error('Value is not a number'),
    };
  }

  if (isPartial(str)) {
    return {
      error: Error('Enter a number'),
    };
  }

  const value = stringToNumber(str);

  if (isNaN(value)) {
    return {
      error: Error('Value is not a number'),
    };
  }

  if (props.minValue !== undefined && value < props.minValue) {
    return {
      error: Error(`Value must be higher than ${props.minValue}`),
      value,
    };
  }

  if (props.maxValue !== undefined && value > props.maxValue) {
    return {
      error: Error(`Value must be less than ${props.maxValue}`),
      value,
    };
  }

  if (props.validate) {
    const error = props.validate(value);
    if (error) {
      return {
        error: Error(error),
        value,
      };
    }
  }

  return {
    value,
  };
}
