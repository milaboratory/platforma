import { describe, it, expect, vi } from "vitest";
import {
  SERVICE_CAPABILITY_FLAGS,
  registerServiceCapabilities,
  resolveRequiredServices,
  getMethodNames,
  isKnownServiceName,
} from "./service_capabilities";
import { Services } from "./service_declarations";

describe("SERVICE_CAPABILITY_FLAGS", () => {
  it("should have one flag per service", () => {
    expect(SERVICE_CAPABILITY_FLAGS).toHaveLength(Object.keys(Services).length);
  });

  it("should derive requires* flag names from Services keys", () => {
    for (const key of Object.keys(Services)) {
      expect(SERVICE_CAPABILITY_FLAGS).toContain(`requires${key}`);
    }
  });
});

describe("registerServiceCapabilities", () => {
  it("should call register once per service with (flag, true)", () => {
    const register = vi.fn();
    registerServiceCapabilities(register);
    expect(register).toHaveBeenCalledTimes(Object.keys(Services).length);
    for (const call of register.mock.calls) {
      expect(call[0]).toMatch(/^requires[A-Z]/);
      expect(call[1]).toBe(true);
    }
  });
});

describe("resolveRequiredServices", () => {
  it("should return empty array for undefined flags", () => {
    expect(resolveRequiredServices(undefined)).toEqual([]);
  });

  it("should return empty array for flags without requires*", () => {
    expect(resolveRequiredServices({ supportsLazyState: true })).toEqual([]);
  });

  it("should return empty array when requires* is false", () => {
    expect(resolveRequiredServices({ requiresPFrameSpec: false })).toEqual([]);
  });

  it("should resolve a single required service", () => {
    const result = resolveRequiredServices({ requiresPFrameSpec: true });
    expect(result).toEqual([Services.PFrameSpec]);
  });

  it("should resolve multiple required services", () => {
    const result = resolveRequiredServices({
      requiresPFrameSpec: true,
      requiresPFrame: true,
    });
    expect(result).toContain(Services.PFrameSpec);
    expect(result).toContain(Services.PFrame);
    expect(result).toHaveLength(2);
  });

  it("should ignore non-boolean requires* values", () => {
    const result = resolveRequiredServices({
      requiresPFrameSpec: true,
      requiresModelAPIVersion: 2,
    });
    expect(result).toEqual([Services.PFrameSpec]);
  });
});

describe("isKnownServiceName", () => {
  it("should return true for registered service names", () => {
    for (const id of Object.values(Services)) {
      expect(isKnownServiceName(id as string)).toBe(true);
    }
  });

  it("should return false for unknown names", () => {
    expect(isKnownServiceName("nonexistent")).toBe(false);
  });
});

describe("getMethodNames", () => {
  it("should return own method names", () => {
    const obj = {
      foo() {},
      bar() {},
      baz: 42,
    };
    const names = getMethodNames(obj as any);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
    expect(names).not.toContain("baz");
  });

  it("should include prototype methods", () => {
    class Base {
      baseMethod() {}
    }
    class Child extends Base {
      childMethod() {}
    }
    const names = getMethodNames(new Child() as any);
    expect(names).toContain("baseMethod");
    expect(names).toContain("childMethod");
    expect(names).not.toContain("constructor");
  });

  it("should not include getters", () => {
    const obj = Object.create(null, {
      method: { value: () => {}, enumerable: true },
      getter: { get: () => 42, enumerable: true },
    });
    const names = getMethodNames(obj);
    expect(names).toContain("method");
    expect(names).not.toContain("getter");
  });
});
