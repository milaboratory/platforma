import { describe, expect, test } from "vitest";
import { foldersNameBlank, foldersNameTaken, foldersUniqueName } from "./naming";

describe("foldersNameTaken", () => {
  test("a free name is not taken", () => {
    expect(foldersNameTaken("Samples", ["Runs", "Analysis"])).toBe(false);
  });

  test("case does not matter", () => {
    expect(foldersNameTaken("Samples", ["samples"])).toBe(true);
    expect(foldersNameTaken("SAMPLES", ["Samples"])).toBe(true);
  });

  test("surrounding whitespace does not matter", () => {
    expect(foldersNameTaken(" Samples ", ["Samples"])).toBe(true);
    expect(foldersNameTaken("Samples", ["samples  "])).toBe(true);
  });
});

describe("foldersNameBlank", () => {
  test("an empty name and one of whitespace only are blank", () => {
    expect(foldersNameBlank("")).toBe(true);
    expect(foldersNameBlank(" \t ")).toBe(true);
  });

  test("a name with anything in it is not blank", () => {
    expect(foldersNameBlank(" a ")).toBe(false);
  });
});

describe("foldersUniqueName", () => {
  test("a free name is returned untouched", () => {
    expect(foldersUniqueName("Samples", ["Runs"])).toBe("Samples");
  });

  test("a taken name gains the copy suffix", () => {
    expect(foldersUniqueName("Samples", ["Samples"])).toBe("Samples (Copy)");
  });

  test("the suffix counts up while names are taken", () => {
    expect(foldersUniqueName("Samples", ["Samples", "Samples (Copy)"])).toBe("Samples (Copy 2)");
    expect(foldersUniqueName("Samples", ["Samples", "Samples (Copy)", "Samples (Copy 2)"])).toBe(
      "Samples (Copy 3)",
    );
  });

  test("an existing copy suffix is replaced rather than stacked", () => {
    expect(foldersUniqueName("Samples (Copy)", ["Samples (Copy)"])).toBe("Samples (Copy 2)");
    expect(foldersUniqueName("Samples (Copy 2)", ["Samples (Copy 2)", "Samples (Copy)"])).toBe(
      "Samples (Copy 3)",
    );
  });

  test("collision is decided without regard to case", () => {
    expect(foldersUniqueName("Samples", ["samples"])).toBe("Samples (Copy)");
    expect(foldersUniqueName("Samples", ["samples", "SAMPLES (COPY)"])).toBe("Samples (Copy 2)");
  });

  test("a name that merely contains another is not a collision", () => {
    expect(foldersUniqueName("Samples", ["Samples 2024"])).toBe("Samples");
  });
});
