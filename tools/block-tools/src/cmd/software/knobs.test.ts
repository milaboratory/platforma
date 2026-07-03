import { describe, it, expect } from "vitest";
import { parseScenario } from "./knobs";

describe("parseScenario — knobs collapse to the supported set", () => {
  it("no location => legacy (bare invocation, pl-pkg parity)", () => {
    expect(parseScenario({})).toEqual({ kind: "legacy" });
    expect(parseScenario({ channel: "dev" })).toEqual({ kind: "legacy" });
  });

  it("explicit location => a target cell with variant normalized to both kinds", () => {
    expect(parseScenario({ channel: "dev", variant: "binary", location: "remote" })).toEqual({
      kind: "target",
      channel: "dev",
      docker: false,
      binary: true,
      remote: true,
    });
    expect(parseScenario({ location: "local" })).toEqual({
      kind: "target",
      channel: "release",
      docker: true,
      binary: true,
      remote: false,
    });
  });

  it("variant=all builds both kinds", () => {
    expect(parseScenario({ channel: "dev", variant: "all", location: "local" })).toEqual({
      kind: "target",
      channel: "dev",
      docker: true,
      binary: true,
      remote: false,
    });
  });

  it("variant=none => no-software, regardless of location", () => {
    expect(parseScenario({ channel: "dev", variant: "none", location: "local" })).toEqual({
      kind: "no-software",
    });
    expect(parseScenario({ variant: "none" })).toEqual({ kind: "no-software" });
  });

  it("use-published collapses everything but rejects docker", () => {
    expect(parseScenario({ channel: "dev", usePublished: true })).toEqual({
      kind: "use-published",
    });
    expect(() => parseScenario({ usePublished: true, variant: "docker" })).toThrow(/binary-only/);
  });

  it("ssh is rejected", () => {
    expect(() => parseScenario({ location: "ssh" })).toThrow(/ssh/);
  });
});
