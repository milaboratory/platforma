import { describe, it, expect, vi } from "vitest";
import { ModelServiceRegistry, UiServiceRegistry } from "./service_registry";
import { service } from "./service_types";

// Create test services with distinct types
const TestServices = {
  Alpha: service<{ alphaModel: () => void }, { alphaUi: () => void }>()({
    type: "wasm",
    name: "alpha",
  }),
  Beta: service<{ betaModel: () => void }, { betaUi: () => void }>()({
    type: "node",
    name: "beta",
  }),
};

describe("ModelServiceRegistry", () => {
  it("should lazily instantiate service on first get()", () => {
    const factory = vi.fn(() => ({ alphaModel: () => {} }));
    const registry = new ModelServiceRegistry(TestServices, {
      Alpha: factory,
      Beta: null,
    });
    expect(factory).not.toHaveBeenCalled();
    registry.get(TestServices.Alpha);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("should cache instance on subsequent get() calls", () => {
    const factory = vi.fn(() => ({ alphaModel: () => {} }));
    const registry = new ModelServiceRegistry(TestServices, {
      Alpha: factory,
      Beta: null,
    });
    const first = registry.get(TestServices.Alpha);
    const second = registry.get(TestServices.Alpha);
    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("should return null for services with null factory", () => {
    const registry = new ModelServiceRegistry(TestServices, {
      Alpha: () => ({ alphaModel: () => {} }),
      Beta: null,
    });
    expect(registry.get(TestServices.Beta)).toBeNull();
  });

  it("should throw for unknown service IDs", () => {
    const registry = new ModelServiceRegistry(TestServices, {
      Alpha: () => ({ alphaModel: () => {} }),
      Beta: null,
    });
    expect(() => registry.get("unknown" as any)).toThrow(/not registered/);
  });
});

describe("UiServiceRegistry", () => {
  it("should lazily instantiate UI service", () => {
    const factory = vi.fn(() => ({ alphaUi: () => {} }));
    const registry = new UiServiceRegistry(TestServices, {
      Alpha: factory,
      Beta: null,
    });
    expect(factory).not.toHaveBeenCalled();
    registry.get(TestServices.Alpha);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
