import { describe, expect, test } from "vitest";
import { TreeStateUpdateError } from "@milaboratories/pl-tree";
import { PermissionDeniedError, UnauthenticatedError } from "@milaboratories/pl-client";
import { isSnapshotFailsafeError } from "./project";

/**
 * Which first-refresh failures implicate the snapshot itself, and so delete it.
 *
 * Every failure retries cold regardless, so a mistake here cannot leave a project unopenable.
 * What it can do is either destroy a good mirror over a transient link problem, or keep a bad
 * one and pay a wasted warm attempt on every open.
 */
describe("the fail-safe classification", () => {
  test("authentication and permission failures implicate the snapshot", () => {
    expect(isSnapshotFailsafeError(new UnauthenticatedError("token expired"))).toBe(true);
    expect(isSnapshotFailsafeError(new PermissionDeniedError("grant revoked"))).toBe(true);
  });

  test("a tree inconsistency implicates the snapshot", () => {
    expect(isSnapshotFailsafeError(new TreeStateUpdateError("orphan resource"))).toBe(true);
  });

  test("a wrapped tree inconsistency still implicates it", () => {
    // The cause chain is walked precisely so that a wrapper introduced anywhere between the
    // tree update and the caller cannot silently disarm this arm of the fail-safe.
    const wrapped = new Error("refresh failed", {
      cause: new Error("while loading", { cause: new TreeStateUpdateError("orphan resource") }),
    });
    expect(isSnapshotFailsafeError(wrapped)).toBe(true);
  });

  test("a link failure does not, so the mirror is kept", () => {
    expect(isSnapshotFailsafeError(new Error("socket hang up"))).toBe(false);
    expect(isSnapshotFailsafeError(new Error("deadline exceeded"))).toBe(false);
  });

  test("nothing exotic throws", () => {
    // A cause chain that loops must not hang the classifier.
    const looped: { cause?: unknown } = {};
    looped.cause = looped;

    expect(isSnapshotFailsafeError(looped)).toBe(false);
    expect(isSnapshotFailsafeError(undefined)).toBe(false);
    expect(isSnapshotFailsafeError(null)).toBe(false);
    expect(isSnapshotFailsafeError("a string")).toBe(false);
  });
});
