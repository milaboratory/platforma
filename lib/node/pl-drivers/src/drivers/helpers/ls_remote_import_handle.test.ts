import { describe, expect, test } from "vitest";
import { createIndexImportHandle, parseIndexHandle } from "./ls_remote_import_handle";

// Golden URL for the no-envelope case — guards against accidental key injection or ordering drift.
// Value: index://index/<url-encoded JSON of {storageId:"s3",path:"x/y"}>
const GOLDEN_NO_ENVELOPE = `index://index/${encodeURIComponent(JSON.stringify({ storageId: "s3", path: "x/y" }))}`;

describe("createIndexImportHandle", () => {
  test("round-trips additionalInfo envelope", () => {
    const envelope = { uid: "u", sid: "s", sig: "abc123", exp: "9999999999", kid: "k", v: "1" };
    const handle = createIndexImportHandle("s3", "x/y", envelope);
    const parsed = parseIndexHandle(handle);
    expect(parsed.storageId).toBe("s3");
    expect(parsed.path).toBe("x/y");
    expect(parsed.additionalInfo).toEqual(envelope);
  });

  test("no-arg case is byte-identical to golden (regression guard)", () => {
    const handle = createIndexImportHandle("s3", "x/y");
    expect(handle).toBe(GOLDEN_NO_ENVELOPE);
  });

  test("empty map is pruned — byte-identical to no-arg golden", () => {
    const handle = createIndexImportHandle("s3", "x/y", {});
    expect(handle).toBe(GOLDEN_NO_ENVELOPE);
  });

  test("absent envelope: decoded handle has no additionalInfo key", () => {
    const handle = createIndexImportHandle("s3", "x/y");
    const parsed = parseIndexHandle(handle);
    expect(parsed.additionalInfo).toBeUndefined();
    // Confirm the key is truly absent from decoded JSON (not just undefined)
    expect(Object.prototype.hasOwnProperty.call(parsed, "additionalInfo")).toBe(false);
  });

  test("parseIndexHandle accepts old handle without additionalInfo", () => {
    // Simulate a handle that was created before this change (no additionalInfo key in JSON)
    const oldJson = JSON.stringify({ storageId: "legacy", path: "a/b" });
    const oldHandle =
      `index://index/${encodeURIComponent(oldJson)}` as import("@milaboratories/pl-model-common").ImportFileHandleIndex;
    const parsed = parseIndexHandle(oldHandle);
    expect(parsed.storageId).toBe("legacy");
    expect(parsed.path).toBe("a/b");
    expect(parsed.additionalInfo).toBeUndefined();
  });
});
