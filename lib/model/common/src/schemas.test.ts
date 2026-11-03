import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  Annotation,
  PlId,
  readAnnotationJson,
  readAnnotationJsonOrThrow,
  uniquePlId,
} from "./index";

describe("annotation schemas", () => {
  const spec = (key: string, value: string) => ({ annotations: { [key]: value } });

  test("coerce palette mapping values to numbers", () => {
    expect(
      readAnnotationJson(
        spec(
          Annotation.Graph.Palette,
          JSON.stringify({ name: "p", mapping: { a: "1", b: 2 }, extra: 1 }),
        ),
        Annotation.Graph.Palette,
      ),
    ).toEqual({ name: "p", mapping: { a: 1, b: 2 } });
    expect(
      readAnnotationJson(
        spec(Annotation.Graph.Palette, JSON.stringify({ name: "p", mapping: { a: "x" } })),
        Annotation.Graph.Palette,
      ),
    ).toBeUndefined();
  });

  test("keep extra trace entry fields", () => {
    const trace = [{ type: "t", label: "l", importance: 3 }];
    expect(
      readAnnotationJson(spec(Annotation.Trace, JSON.stringify(trace)), Annotation.Trace),
    ).toEqual(trace);
  });

  test("accept either array type for discrete values", () => {
    expect(
      readAnnotationJson(spec(Annotation.DiscreteValues, "[1,2]"), Annotation.DiscreteValues),
    ).toEqual([1, 2]);
    expect(
      readAnnotationJson(spec(Annotation.DiscreteValues, '["a"]'), Annotation.DiscreteValues),
    ).toEqual(["a"]);
    expect(
      readAnnotationJson(spec(Annotation.DiscreteValues, '[1,"a"]'), Annotation.DiscreteValues),
    ).toBeUndefined();
  });

  test("throw with the key and value", () => {
    expect(() => readAnnotationJsonOrThrow(spec(Annotation.Max, '"x"'), Annotation.Max)).toThrow(
      /^readAnnotationJsonOrThrow failed, key: pl7.app\/max, value: "x", error: /,
    );
  });

  test("uniquePlId gives a valid id", () => {
    expect(uniquePlId()).toMatch(/^[A-Z2-7]{24}$/);
  });

  test("PlId checks every character", () => {
    expect(v.is(PlId, "A".repeat(24))).toBe(true);
    expect(v.is(PlId, "A" + "!".repeat(23))).toBe(false);
  });
});
