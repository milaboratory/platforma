import { test, expect, describe } from "vitest";
import { cachedDeserialize, canonicalJsonBytes, canonicalJsonGzBytes } from "./buffer";

describe("canonical serialization and deserialization", () => {
  const testObject = {
    b: 2,
    a: "hello",
    c: {
      e: "world",
      d: 123,
    },
  };

  const canonicalObjectString = '{"a":"hello","b":2,"c":{"d":123,"e":"world"}}';

  describe("canonicalJsonBytes", () => {
    test("should serialize an object to canonical JSON bytes", () => {
      const serialized = canonicalJsonBytes(testObject);
      const textDecoder = new TextDecoder();
      const jsonString = textDecoder.decode(serialized);
      expect(jsonString).toEqual(canonicalObjectString);

      const deserialized = cachedDeserialize(serialized);
      expect(deserialized).toEqual(testObject);
    });
  });

  describe("canonicalJsonGzBytes", () => {
    test("should serialize and then deserialize an object with default gzip settings", () => {
      const { data: serialized } = canonicalJsonGzBytes(testObject);
      const deserialized = cachedDeserialize(serialized);
      expect(deserialized).toEqual(testObject);
    });

    test("should not gzip if minSizeToGzip is undefined", () => {
      const { data: serialized, isGzipped } = canonicalJsonGzBytes(testObject, undefined);
      expect(isGzipped).toBe(false);
      const jsonString = new TextDecoder().decode(serialized);
      expect(jsonString).toEqual(canonicalObjectString);
    });

    test("should always gzip if minSizeToGzip is -1", () => {
      const { data: serialized, isGzipped } = canonicalJsonGzBytes(testObject, -1);
      expect(isGzipped).toBe(true);
      expect(serialized[0]).toBe(0x1f);
      expect(serialized[1]).toBe(0x8b);
      const deserialized = cachedDeserialize(serialized);
      expect(deserialized).toEqual(testObject);
    });

    test("should gzip data larger than minSizeToGzip", () => {
      const largeObject = { data: "a".repeat(200) };
      // Force gzipping with a small threshold
      const { data: serialized } = canonicalJsonGzBytes(largeObject, 100);

      // Check for gzip magic numbers: 0x1f 0x8b
      expect(serialized[0]).toBe(0x1f);
      expect(serialized[1]).toBe(0x8b);

      const deserialized = cachedDeserialize(serialized);
      expect(deserialized).toEqual(largeObject);
    });

    test("should use default minSizeToGzip and not gzip small objects", () => {
      const smallObject = { a: 1 };
      const { data: serialized } = canonicalJsonGzBytes(smallObject); // default minSizeToGzip is 16_384

      // Check it's not gzipped by seeing if it decodes to the canonical string
      const text = new TextDecoder().decode(serialized);
      expect(text).toBe('{"a":1}');
    });

    test("should correctly deserialize both gzipped and non-gzipped data", () => {
      const { data: gzippedData } = canonicalJsonGzBytes(testObject, 10); // Force gzip
      const { data: nonGzippedData } = canonicalJsonGzBytes(testObject, 100_000); // Prevent gzip

      expect(cachedDeserialize(gzippedData)).toEqual(testObject);
      expect(cachedDeserialize(nonGzippedData)).toEqual(testObject);
    });
  });

  describe("cachedDeserialize", () => {
    test("deserialized object should be deeply frozen", () => {
      const { data: serialized } = canonicalJsonGzBytes(testObject);
      const deserialized = cachedDeserialize(serialized) as typeof testObject;

      expect(Object.isFrozen(deserialized)).toBe(true);
      expect(Object.isFrozen(deserialized.c)).toBe(true);

      expect(() => {
        (deserialized as any).a = "new value";
      }).toThrow();

      expect(() => {
        (deserialized as any).c.d = 456;
      }).toThrow();
    });
  });
});
