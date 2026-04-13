import { describe, expect, it } from "vitest";
import { estimateTokens } from "./tokens";

// --- Test data ---

const flatObject = { name: "Alice", age: 30, active: true };

const nestedObject = {
  user: { name: "Bob", address: { city: "NYC", zip: "10001" } },
};

const flatArray = [1, 2, 3, "four", true, null];

const nestedArray = [[1, 2], [3, [4, 5]], "deep"];

const mixedDeep = {
  a: [{ b: [{ c: "leaf" }] }],
  d: { e: { f: { g: 42 } } },
};

const typedArrayValue = new Uint8Array([0, 1, 2, 255]);

const largeFlat = Array.from({ length: 100 }, (_, i) => `item-${i}`);

const wideObject = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key${i}`, i]));

const deepChain = (() => {
  let obj: Record<string, unknown> = { value: "bottom" };
  for (let i = 0; i < 20; i++) obj = { nested: obj };
  return obj;
})();

const emptyContainers = { emptyObj: {}, emptyArr: [], emptyStr: "", nested: { also: {} } };

// Helper: actual token estimate from JSON.stringify
function actualTokens(v: unknown): number {
  return Math.ceil(JSON.stringify(v).length / 4);
}

// --- Tests ---

describe("estimateTokens", () => {
  describe("primitives", () => {
    it("null → 1 token ('null' = 4 chars)", () => {
      expect(estimateTokens(null)).toBe(1);
    });

    it("undefined → 1 token (treated as null)", () => {
      expect(estimateTokens(undefined)).toBe(1);
    });

    it("empty string → 1 token ('\"\"' = 2 chars)", () => {
      expect(estimateTokens("")).toBe(1);
    });

    it("short string matches actual", () => {
      expect(estimateTokens("hello")).toBe(actualTokens("hello"));
    });

    it("number matches actual", () => {
      expect(estimateTokens(42)).toBe(actualTokens(42));
      expect(estimateTokens(3.14)).toBe(actualTokens(3.14));
      expect(estimateTokens(0)).toBe(actualTokens(0));
    });

    it("boolean matches actual", () => {
      expect(estimateTokens(true)).toBe(actualTokens(true));
      expect(estimateTokens(false)).toBe(actualTokens(false));
    });

    it("bigint estimates like number", () => {
      const t = estimateTokens(BigInt(12345));
      expect(typeof t).toBe("number");
      expect(t).toBeGreaterThan(0);
    });
  });

  describe("typed arrays", () => {
    it("Uint8Array matches actual", () => {
      // JSON.stringify(new Uint8Array([0,1,2,255])) doesn't work directly,
      // but our function estimates as if it were [0,1,2,255]
      expect(estimateTokens(typedArrayValue)).toBe(actualTokens([0, 1, 2, 255]));
    });

    it("empty Uint8Array → brackets only", () => {
      expect(estimateTokens(new Uint8Array([]))).toBe(actualTokens([]));
    });

    it("Int32Array", () => {
      const arr = new Int32Array([100, 200, 300]);
      expect(estimateTokens(arr)).toBe(actualTokens([100, 200, 300]));
    });
  });

  describe("arrays", () => {
    it("empty array matches actual", () => {
      expect(estimateTokens([])).toBe(actualTokens([]));
    });

    it("flat number array matches actual", () => {
      expect(estimateTokens([1, 2, 3])).toBe(actualTokens([1, 2, 3]));
    });

    it("mixed array matches actual", () => {
      expect(estimateTokens(flatArray)).toBe(actualTokens(flatArray));
    });

    it("nested array matches actual", () => {
      expect(estimateTokens(nestedArray)).toBe(actualTokens(nestedArray));
    });
  });

  describe("objects", () => {
    it("empty object matches actual", () => {
      expect(estimateTokens({})).toBe(actualTokens({}));
    });

    it("flat object matches actual", () => {
      expect(estimateTokens(flatObject)).toBe(actualTokens(flatObject));
    });

    it("nested object matches actual", () => {
      expect(estimateTokens(nestedObject)).toBe(actualTokens(nestedObject));
    });
  });

  describe("complex structures", () => {
    it("mixed deep ≈ actual", () => {
      expect(estimateTokens(mixedDeep)).toBe(actualTokens(mixedDeep));
    });

    it("deep chain ≈ actual", () => {
      expect(estimateTokens(deepChain)).toBe(actualTokens(deepChain));
    });

    it("empty containers ≈ actual", () => {
      expect(estimateTokens(emptyContainers)).toBe(actualTokens(emptyContainers));
    });

    it("large flat array ≈ actual", () => {
      const est = estimateTokens(largeFlat) as number;
      const act = actualTokens(largeFlat);
      expect(Math.abs(est - act)).toBeLessThanOrEqual(1); // rounding
    });

    it("wide object ≈ actual", () => {
      const est = estimateTokens(wideObject) as number;
      const act = actualTokens(wideObject);
      expect(Math.abs(est - act)).toBeLessThanOrEqual(1);
    });
  });

  describe("node limit", () => {
    it("respects small node limit on flat array", () => {
      const arr = [1, 2, 3, 4, 5]; // 6 nodes: 1 array + 5 numbers
      const result = estimateTokens(arr, 3);
      expect(typeof result).toBe("string");
      expect(result).toContain("truncated");
      expect(result).toContain("3 nodes");
    });

    it("respects small node limit on object", () => {
      const result = estimateTokens({ a: 1, b: 2, c: 3 }, 2);
      expect(typeof result).toBe("string");
      expect(result).toContain("truncated");
    });

    it("returns number when within limit", () => {
      expect(typeof estimateTokens([1, 2], 10)).toBe("number");
    });

    it("node limit = 1 overflows on container with children", () => {
      const result = estimateTokens([1], 1);
      expect(typeof result).toBe("string");
      expect(result).toContain("truncated");
    });

    it("node limit = 1 allows single primitive", () => {
      expect(typeof estimateTokens(42, 1)).toBe("number");
    });

    it("truncated result includes partial token count", () => {
      // [1, 2, 3] with limit 2: node1=array, node2=1, node3>limit
      const result = estimateTokens([1, 2, 3], 2) as string;
      expect(result).toMatch(/^>\d+/);
      expect(result).toContain("truncated at 2 nodes");
    });

    it("deeply nested hits limit", () => {
      const result = estimateTokens({ a: { b: { c: { d: 1 } } } }, 3);
      expect(typeof result).toBe("string");
      expect(result).toContain("truncated");
    });

    it("large flat array within default limit", () => {
      expect(typeof estimateTokens(largeFlat)).toBe("number");
    });

    it("wide object within default limit", () => {
      expect(typeof estimateTokens(wideObject)).toBe("number");
    });
  });

  describe("accuracy vs JSON.stringify", () => {
    it("estimate equals actual for simple cases", () => {
      const cases = [null, 42, "test", true, false, [1, 2, 3], { a: 1 }, { x: "hello", y: [1, 2] }];
      for (const c of cases) {
        expect(estimateTokens(c)).toBe(actualTokens(c));
      }
    });

    it("estimate within 1 token of actual for larger structures", () => {
      const cases = [
        flatObject,
        nestedObject,
        flatArray,
        mixedDeep,
        deepChain,
        wideObject,
        largeFlat,
      ];
      for (const c of cases) {
        const est = estimateTokens(c) as number;
        const act = actualTokens(c);
        expect(Math.abs(est - act)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("edge cases", () => {
    it("function treated as empty object", () => {
      expect(typeof estimateTokens(() => {})).toBe("number");
    });

    it("symbol treated as empty object", () => {
      expect(typeof estimateTokens(Symbol("test"))).toBe("number");
    });
  });
});
