import { describe, expect, test } from "vitest";
import * as semver from "semver";
import { AnyChannel, StableChannel } from "@milaboratories/pl-model-middle-layer";
import type { BlockPackId } from "@milaboratories/pl-model-middle-layer";
import { parseSelector, resolveKind, selectorToRange } from "./kind_resolver";
import type { KindOverview } from "./schema_kinds";

const block = (version: string): BlockPackId => ({
  organization: "acme",
  name: "blk",
  version,
});

// Implementing block ids, one per kind version. Block versions are independent
// of the kind versions they implement.
const b100 = block("3.0.0"); // implements kind 1.0.0 (stable)
const b120 = block("3.1.0"); // implements kind 1.2.0 (stable)
const b130 = block("3.2.0"); // implements kind 1.3.0 (stable)
const b200 = block("4.0.0"); // implements kind 2.0.0 (unstable only)

/**
 * Overview with a multi-step version ladder inside one major, so patch-tier and
 * minor-tier resolution land on different versions, and a top kind version
 * (2.0.0) whose only implementer sits off the stable channel — the
 * `no-stable-implementation` fixture.
 */
const overview: KindOverview = {
  schema: "v1",
  implementers: [
    { id: b100, kindVersion: "1.0.0", channels: [StableChannel] },
    { id: b120, kindVersion: "1.2.0", channels: [StableChannel] },
    { id: b130, kindVersion: "1.3.0", channels: [StableChannel] },
    { id: b200, kindVersion: "2.0.0", channels: ["unstable"] },
  ],
  kindVersions: [
    { kindVersion: "1.0.0", latestByChannel: { [StableChannel]: b100, [AnyChannel]: b100 } },
    { kindVersion: "1.2.0", latestByChannel: { [StableChannel]: b120, [AnyChannel]: b120 } },
    { kindVersion: "1.3.0", latestByChannel: { [StableChannel]: b130, [AnyChannel]: b130 } },
    { kindVersion: "2.0.0", latestByChannel: { [AnyChannel]: b200 } },
  ],
};

describe("selector parsing / range mapping", () => {
  test("leading operator selects the tier; bare version is exact", () => {
    expect(parseSelector("1.2.0")).toEqual({ op: "exact", version: "1.2.0" });
    expect(parseSelector("~1.2.0")).toEqual({ op: "patch", version: "1.2.0" });
    expect(parseSelector("^1.2.0")).toEqual({ op: "minor", version: "1.2.0" });
  });

  test("selectorToRange emits the explicit range for each tier", () => {
    expect(selectorToRange({ op: "exact", version: "1.2.0" })).toBe("=1.2.0");
    expect(selectorToRange({ op: "patch", version: "1.2.0" })).toBe(">=1.2.0 <1.3.0-0");
    expect(selectorToRange({ op: "minor", version: "1.0.0" })).toBe(">=1.0.0 <2.0.0-0");
  });

  test("at or above 1.0.0 the explicit ranges are equivalent to npm ~ and ^", () => {
    for (const version of ["1.0.0", "1.2.3", "2.0.0", "10.4.0", "1.2.0-rc.1"]) {
      expect(semver.validRange(selectorToRange({ op: "patch", version }))).toBe(
        semver.validRange(`~${version}`),
      );
      expect(semver.validRange(selectorToRange({ op: "minor", version }))).toBe(
        semver.validRange(`^${version}`),
      );
    }
  });

  // npm collapses `^0.2.0` and `~0.2.0` to the same range, treating a 0.x minor
  // as the breaking boundary. The kind scheme puts params-breaks on the major at
  // every major, so the two tiers must stay distinct for a 0.x kind.
  test("below 1.0.0 the tiers stay distinct, unlike npm ~ and ^", () => {
    expect(selectorToRange({ op: "patch", version: "0.2.0" })).toBe(">=0.2.0 <0.3.0-0");
    expect(selectorToRange({ op: "minor", version: "0.2.0" })).toBe(">=0.2.0 <1.0.0-0");

    expect(semver.validRange("^0.2.0")).toBe(semver.validRange("~0.2.0"));
    expect(semver.satisfies("0.3.0", selectorToRange({ op: "minor", version: "0.2.0" }))).toBe(
      true,
    );
    expect(semver.satisfies("0.3.0", selectorToRange({ op: "patch", version: "0.2.0" }))).toBe(
      false,
    );
    expect(semver.satisfies("1.0.0", selectorToRange({ op: "minor", version: "0.2.0" }))).toBe(
      false,
    );
  });

  test("an unparseable version is rejected at range construction", () => {
    expect(() => selectorToRange({ op: "minor", version: "latest" })).toThrow();
  });
});

describe("resolveKind", () => {
  test("exact @X.Y.Z hit -> that kind version's stable block", () => {
    const r = resolveKind(overview, "1.2.0", { allowUnstable: false });
    expect(r).toEqual({ ok: true, blockId: b120, channel: StableChannel });
  });

  test("minor float ^1.0.0 picks the newest matching kind version (1.3.0)", () => {
    const r = resolveKind(overview, "^1.0.0", { allowUnstable: false });
    // ^1.0.0 == >=1.0.0 <2.0.0 -> maxSatisfying is 1.3.0.
    expect(r).toEqual({ ok: true, blockId: b130, channel: StableChannel });
  });

  test("patch float ~1.2.0 stays within the minor line", () => {
    const r = resolveKind(overview, "~1.2.0", { allowUnstable: false });
    // ~1.2.0 == >=1.2.0 <1.3.0 -> maxSatisfying is 1.2.0.
    expect(r).toEqual({ ok: true, blockId: b120, channel: StableChannel });
  });

  test("kind version exists but only an unstable implementer -> no-stable-implementation", () => {
    const r = resolveKind(overview, "2.0.0", { allowUnstable: false });
    expect(r).toEqual({ ok: false, reason: "no-stable-implementation" });
  });

  test("allowUnstable lifts the same 2.0.0 to the any channel", () => {
    const r = resolveKind(overview, "2.0.0", { allowUnstable: true });
    expect(r).toEqual({ ok: true, blockId: b200, channel: AnyChannel });
  });

  test("selector satisfying zero kind versions -> no-matching-kind-version", () => {
    const r = resolveKind(overview, "5.0.0", { allowUnstable: false });
    expect(r).toEqual({ ok: false, reason: "no-matching-kind-version" });
  });
});
