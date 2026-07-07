import { describe, it, expect } from "vitest";
import { parseScenario } from "./knobs";

describe("parseScenario — knobs collapse to the supported set", () => {
  it("no location => legacy (bare invocation, pl-pkg parity)", () => {
    expect(parseScenario({})).toEqual({ kind: "legacy" });
    expect(parseScenario({ channel: "dev" })).toEqual({ kind: "legacy" });
  });

  it("explicit location => a target cell carrying the knobs as enums", () => {
    expect(parseScenario({ channel: "dev", variant: "binary", location: "remote" })).toEqual({
      kind: "target",
      channel: "dev",
      variant: "binary",
      location: "remote",
    });
    // channel and variant default when unset.
    expect(parseScenario({ location: "local" })).toEqual({
      kind: "target",
      channel: "release",
      variant: "all",
      location: "local",
    });
  });

  it("variant=all is preserved on the target", () => {
    expect(parseScenario({ channel: "dev", variant: "all", location: "local" })).toEqual({
      kind: "target",
      channel: "dev",
      variant: "all",
      location: "local",
    });
  });

  it("variant=none => no-software, regardless of location", () => {
    expect(parseScenario({ channel: "dev", variant: "none", location: "local" })).toEqual({
      kind: "no-software",
    });
    expect(parseScenario({ variant: "none" })).toEqual({ kind: "no-software" });
  });

  it("use-published collapses everything but rejects docker and all (binary-only)", () => {
    expect(parseScenario({ channel: "dev", usePublished: true })).toEqual({
      kind: "use-published",
    });
    expect(parseScenario({ usePublished: true, variant: "binary" })).toEqual({
      kind: "use-published",
    });
    expect(() => parseScenario({ usePublished: true, variant: "docker" })).toThrow(/binary-only/);
    expect(() => parseScenario({ usePublished: true, variant: "all" })).toThrow(/binary-only/);
  });
});
