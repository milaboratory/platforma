import { Ranges, normalizeRanges } from "./ranges";
import { describe, it, expect } from "vitest";

describe("normalizeRanges", () => {
  const cases: { name: string; input: Ranges; expected: Ranges }[] = [
    {
      name: "empty ranges",
      input: { ranges: [] },
      expected: { ranges: [] },
    },
    {
      name: "single range",
      input: { ranges: [{ from: 0, to: 10 }] },
      expected: { ranges: [{ from: 0, to: 10 }] },
    },
    {
      name: "two unsorted non-overlapping ranges",
      input: {
        ranges: [
          { from: 20, to: 30 },
          { from: 0, to: 10 },
        ],
      },
      expected: {
        ranges: [
          { from: 0, to: 10 },
          { from: 20, to: 30 },
        ],
      },
    },
    {
      name: "two overlapping ranges",
      input: {
        ranges: [
          { from: 0, to: 10 },
          { from: 5, to: 15 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 15 }] },
    },
    {
      name: "two adjacent ranges",
      input: {
        ranges: [
          { from: 0, to: 10 },
          { from: 10, to: 20 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 20 }] },
    },
    {
      name: "multiple overlapping ranges",
      input: {
        ranges: [
          { from: 0, to: 10 },
          { from: 5, to: 15 },
          { from: 12, to: 20 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 20 }] },
    },
    {
      name: "inner range",
      input: {
        ranges: [
          { from: 0, to: 20 },
          { from: 5, to: 15 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 20 }] },
    },
    {
      name: "inner range with outer range",
      input: {
        ranges: [
          { from: 5, to: 15 },
          { from: 20, to: 30 },
          { from: 0, to: 20 },
        ],
      },
      expected: { ranges: [{ from: 0, to: 30 }] },
    },
    {
      name: "more than 1 range in expected",
      input: {
        ranges: [
          { from: 25, to: 30 },
          { from: 20, to: 25 },

          { from: 0, to: 8 },
          { from: 2, to: 10 },
          { from: 1, to: 9 },

          { from: 40, to: 50 },
          { from: 45, to: 47 },
        ],
      },
      expected: {
        ranges: [
          { from: 0, to: 10 },
          { from: 20, to: 30 },
          { from: 40, to: 50 },
        ],
      },
    },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      normalizeRanges(tc.input);

      expect(tc.input).toEqual(tc.expected);
    });
  }
});
