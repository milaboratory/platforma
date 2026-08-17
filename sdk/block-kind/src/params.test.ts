import { describe, expect, test } from "vitest";
import { assertDeclaredParams } from "./params";

/**
 * What a kind's params check rejects, and what it says when it does.
 *
 * The messages are asserted on, not just the throwing: they are read by whoever wrote the
 * template file, at a point where nothing else in the system knows what they meant. A
 * rejection that does not name the offending key is a rejection they cannot act on.
 */

describe("assertDeclaredParams", () => {
  test("an object holding only declared keys passes, and narrows to a readable record", () => {
    const value: unknown = { numbers: [1, 2] };

    assertDeclaredParams(value, ["numbers", "label"]);

    // The assertion's whole purpose at the call site: fields become readable without a cast,
    // each still `unknown` so the kind has to say what it expects.
    const { numbers } = value;
    expect(numbers).toEqual([1, 2]);
  });

  test("a declared key that is absent is fine, since optionality is the kind's to state", () => {
    expect(() => assertDeclaredParams({}, ["numbers"])).not.toThrow();
  });

  test("an undeclared key is refused, and the message names it beside the contract", () => {
    // The misspelling this exists for: `number` for `numbers` would otherwise be dropped in
    // silence and the block would initialize blank.
    expect(() => assertDeclaredParams({ number: [1] }, ["numbers"])).toThrow(
      "Params carry 'number', which this block does not declare. It takes 'numbers'.",
    );
  });

  test("several undeclared keys are all named, so one pass fixes the file", () => {
    const failing = () => assertDeclaredParams({ a: 1, b: 2 }, ["numbers"]);

    expect(failing).toThrow("'a', 'b'");
  });

  test("a kind that declares nothing says so, rather than listing an empty contract", () => {
    expect(() => assertDeclaredParams({ label: "x" }, [])).toThrow(
      "This block takes no params, but 'label' was set.",
    );
  });

  test("an empty object satisfies a kind that declares nothing", () => {
    expect(() => assertDeclaredParams({}, [])).not.toThrow();
  });

  describe("a value that is not an object at all", () => {
    test("null is named as null, not as an object", () => {
      // `typeof null === "object"`, so this is the case a shape check written by hand
      // usually lets through.
      expect(() => assertDeclaredParams(null, [])).toThrow("Params must be an object, not null.");
    });

    test("an array is refused, though its keys would have looked declared", () => {
      // `Object.keys([])` is empty, so an array would otherwise pass a kind that declares
      // nothing — and `Object.keys(["a"])` is `["0"]`, which no contract lists.
      expect(() => assertDeclaredParams([], [])).toThrow("not an array");
    });

    test("a primitive is printed, not just typed", () => {
      // A quoting mistake in the file — `params: \"{}\"` — is only obvious when the value
      // itself is shown.
      expect(() => assertDeclaredParams("{}", [])).toThrow('not a string ("{}")');
    });

    test("a number is refused, though it has no keys to object to", () => {
      // `Object.keys(5)` is empty, so this is the second case a hand-written check misses.
      expect(() => assertDeclaredParams(5, [])).toThrow("not a number (5)");
    });

    test("nothing at all is described as nothing", () => {
      expect(() => assertDeclaredParams(undefined, [])).toThrow("not nothing");
    });
  });
});
