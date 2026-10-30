import { describe, expect, it } from "vitest";
import { isEmptyCapture } from "./screenshot";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

describe("isEmptyCapture", () => {
  it("counts an empty string as empty", () => {
    expect(isEmptyCapture("")).toBe(true);
  });

  it("counts whitespace only as empty", () => {
    expect(isEmptyCapture("  \n\t ")).toBe(true);
  });

  it("counts padding only as empty, because it carries no bytes", () => {
    expect(isEmptyCapture("====")).toBe(true);
  });

  it("does not count a real one-pixel PNG as empty", () => {
    expect(isEmptyCapture(ONE_PIXEL_PNG_BASE64)).toBe(false);
  });
});
