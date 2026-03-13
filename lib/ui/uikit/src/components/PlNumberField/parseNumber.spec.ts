import { describe, expect, it } from "vitest";
import { tryParseNumber, numberToDecimalString, validateNumber } from "./parseNumber";

describe("tryParseNumber", () => {
  describe("empty and partial inputs → {} (no value, no error)", () => {
    it.each(["", "-", ".", "-."])("'%s' → {}", (input) => {
      const result = tryParseNumber(input);
      expect(result.value).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe("trailing dot → value, no error", () => {
    it.each([
      ["123.", 123],
      ["-123.", -123],
      ["0.", 0],
    ])("'%s' → { value: %d }", (input, expected) => {
      const result = tryParseNumber(input);
      expect(result.value).toBe(expected);
      expect(result.error).toBeUndefined();
    });
  });

  describe("partial exponential → completed and parsed", () => {
    it.each([
      ["1e", 1],
      ["1e-", 1],
      ["1e+", 1],
      ["5e", 5],
      ["5E", 5],
      ["5e-", 5],
      ["5e+", 5],
    ])("'%s' → { value: %d }", (input, expected) => {
      const result = tryParseNumber(input);
      expect(result.value).toBe(expected);
      expect(result.error).toBeUndefined();
    });
  });

  describe("exact match → value, no error", () => {
    it.each([
      ["123", 123],
      ["-5", -5],
      ["0", 0],
      ["0.5", 0.5],
      ["-0.5", -0.5],
      ["1000", 1000],
      ["999999", 999999],
    ])("'%s' → { value: %d }", (input, expected) => {
      const result = tryParseNumber(input);
      expect(result.value).toBe(expected);
      expect(result.error).toBeUndefined();
    });
  });

  describe("decimal form of very small numbers → value, no error", () => {
    it("'0.0000000001' → { value: 1e-10 }", () => {
      const result = tryParseNumber("0.0000000001");
      expect(result.value).toBe(1e-10);
      expect(result.error).toBeUndefined();
    });
  });

  describe("exponential notation → value, no error", () => {
    it.each([
      ["1e-5", 0.00001],
      ["2e+10", 2e10],
      ["1E-5", 0.00001],
      ["1e5", 1e5],
      ["1.5e2", 150],
      ["-3e4", -30000],
    ])("'%s' → { value: %d }", (input, expected) => {
      const result = tryParseNumber(input);
      expect(result.value).toBe(expected);
      expect(result.error).toBeUndefined();
    });
  });

  describe("non-canonical but parseable → value, no error (formatted on blur)", () => {
    it.each([
      [".5", 0.5],
      ["01", 1],
      ["007", 7],
      ["1.0", 1],
      ["1.10", 1.1],
      ["+5", 5],
      ["00.5", 0.5],
    ])("'%s' → { value: %d }", (input, expected) => {
      const result = tryParseNumber(input);
      expect(result.value).toBe(expected);
      expect(result.error).toBeUndefined();
    });
  });

  describe("locale-formatted numbers → separator error", () => {
    it.each([
      "1,5",
      "1.232,111",
      "1.237.62",
      "555.555.555,100",
      "1,222,333.05",
      "1 234",
      "1.000.000",
    ])("'%s' → separator error", (input) => {
      const result = tryParseNumber(input);
      expect(result.error).toBe("Use dot as decimal separator, e.g. 3.14");
      expect(result.value).toBeUndefined();
    });
  });

  describe("non-numeric input → 'not a number' error", () => {
    it.each(["abc", "12abc", "1.237.asdf62", "hello", "#$%", "1.2.3a"])(
      "'%s' → not a number error",
      (input) => {
        const result = tryParseNumber(input);
        expect(result.error).toBe("Value is not a number");
        expect(result.value).toBeUndefined();
      },
    );
  });

  describe("precision loss → error with actual value", () => {
    it("too many decimal digits", () => {
      const result = tryParseNumber("0.1234567890123456789");
      expect(result.error).toMatch(/^Precision exceeded/);
      expect(result.value).toBeUndefined();
    });

    it("integer exceeds safe range", () => {
      const result = tryParseNumber("9007199254740993");
      expect(result.error).toMatch(/^Precision exceeded/);
      expect(result.value).toBeUndefined();
    });

    it("trailing zeros beyond precision", () => {
      const result = tryParseNumber("1.00000000000000001");
      expect(result.error).toMatch(/^Precision exceeded/);
      expect(result.value).toBeUndefined();
    });

    it("safe integer does not trigger precision error", () => {
      const result = tryParseNumber("9007199254740991");
      expect(result.value).toBe(9007199254740991);
      expect(result.error).toBeUndefined();
    });
  });

  describe("whitespace handling", () => {
    it("trims leading/trailing spaces", () => {
      const result = tryParseNumber("  123  ");
      expect(result.value).toBe(123);
    });

    it("space inside number → separator error", () => {
      const result = tryParseNumber("1 234");
      expect(result.error).toBe("Use dot as decimal separator, e.g. 3.14");
    });
  });
});

describe("numberToDecimalString", () => {
  it("undefined → empty string", () => {
    expect(numberToDecimalString(undefined)).toBe("");
  });

  it("plain numbers pass through", () => {
    expect(numberToDecimalString(123)).toBe("123");
    expect(numberToDecimalString(0.5)).toBe("0.5");
    expect(numberToDecimalString(-42)).toBe("-42");
    expect(numberToDecimalString(0)).toBe("0");
  });

  it("converts exponential to decimal form", () => {
    expect(numberToDecimalString(1e-7)).toBe("0.0000001");
    expect(numberToDecimalString(1e-10)).toBe("0.0000000001");
    expect(numberToDecimalString(2e10)).toBe("20000000000");
  });
});

describe("validateNumber", () => {
  it("returns undefined when within bounds", () => {
    expect(validateNumber(5, { minValue: 0, maxValue: 10 })).toBeUndefined();
  });

  it("returns error when below minValue", () => {
    expect(validateNumber(-1, { minValue: 0 })).toBe("Value must be higher than 0");
  });

  it("returns error when above maxValue", () => {
    expect(validateNumber(11, { maxValue: 10 })).toBe("Value must be less than 10");
  });

  it("runs custom validate function", () => {
    const validate = (v: number) => (v % 2 !== 0 ? "Must be even" : undefined);
    expect(validateNumber(3, { validate })).toBe("Must be even");
    expect(validateNumber(4, { validate })).toBeUndefined();
  });

  it("minValue/maxValue checked before custom validate", () => {
    const validate = (v: number) => (v % 2 !== 0 ? "Must be even" : undefined);
    expect(validateNumber(-1, { minValue: 0, validate })).toBe("Value must be higher than 0");
  });
});
