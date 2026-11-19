import { describe, expect, test } from "vitest";
import { assertParamsObject } from "./params";

/**
 * What a kind's shared params check accepts, and what it says when it does not.
 *
 * The messages are asserted on, not just the throwing: they are read by whoever wrote the
 * template file, at a point where nothing else in the system knows what they meant.
 */

describe("assertParamsObject", () => {
  test("an object passes, and narrows to a readable record", () => {
    const value: unknown = { numbers: [1, 2] };

    assertParamsObject(value);

    // The assertion's whole purpose at the call site: fields become readable without a cast,
    // each still `unknown` so the kind has to say what it expects.
    const { numbers } = value;
    expect(numbers).toEqual([1, 2]);
  });

  test("an empty object passes, since which fields are required is the kind's to say", () => {
    expect(() => assertParamsObject({})).not.toThrow();
  });

  test("a key no kind declares passes, because a parser returns only what it read", () => {
    // The deliberate boundary: an unexpected key is dropped by the kind's own parser rather
    // than refused here. Refusing would mean every kind restating its field list as strings,
    // with nothing keeping the list in step with the type — a field added to the contract and
    // missed in the list would refuse files that are correct.
    expect(() => assertParamsObject({ whatever: 1 })).not.toThrow();
  });

  describe("a value that is not an object at all", () => {
    test("null is named as null, not as an object", () => {
      // `typeof null === "object"`, so this is the case a shape check written by hand
      // usually lets through.
      expect(() => assertParamsObject(null)).toThrow("Params must be an object, not null.");
    });

    test("an array is refused, though it would have read as having no fields", () => {
      // `Object.keys([])` is empty, so an array would otherwise pass for empty params.
      expect(() => assertParamsObject([])).toThrow("not an array");
    });

    test("a primitive is printed, not just typed", () => {
      // A quoting mistake in the file — `params: "{}"` — is only obvious when the value
      // itself is shown.
      expect(() => assertParamsObject("{}")).toThrow('not a string ("{}")');
    });

    test("a number is refused, though it too has no fields to object to", () => {
      expect(() => assertParamsObject(5)).toThrow("not a number (5)");
    });

    test("nothing at all is described as nothing", () => {
      expect(() => assertParamsObject(undefined)).toThrow("not nothing");
    });
  });
});
