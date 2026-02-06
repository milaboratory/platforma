import { describe, expect, it } from "vitest";
import {
  DataModelBuilder,
  defaultRecover,
  defineDataVersions,
  makeDataVersioned,
} from "./block_migrations";

describe("defineDataVersions", () => {
  it("throws on duplicate version values", () => {
    expect(() =>
      defineDataVersions({
        V1: "v1",
        V2: "v1", // duplicate!
      }),
    ).toThrow("Duplicate version values: v1");
  });

  it("throws on empty version values", () => {
    expect(() =>
      defineDataVersions({
        V1: "v1",
        V2: "", // empty!
      }),
    ).toThrow("Version values must be non-empty strings (empty: V2)");
  });

  it("allows unique version values", () => {
    const versions = defineDataVersions({
      V1: "v1",
      V2: "v2",
    });
    expect(versions.V1).toBe("v1");
    expect(versions.V2).toBe("v2");
  });
});

describe("makeDataVersioned", () => {
  it("creates correct DataVersioned shape", () => {
    const versioned = makeDataVersioned("v1", { count: 42 });
    expect(versioned).toStrictEqual({ version: "v1", data: { count: 42 } });
  });
});

describe("DataModel migrations", () => {
  it("resets to initial data on unknown version", () => {
    const Version = defineDataVersions({
      V1: "v1",
      V2: "v2",
    });

    type VersionedData = {
      [Version.V1]: { count: number };
      [Version.V2]: { count: number; label: string };
    };

    const dataModel = new DataModelBuilder<VersionedData>()
      .from(Version.V1)
      .migrate(Version.V2, (v1) => ({ ...v1, label: "" }))
      .init(() => ({ count: 0, label: "" }));

    const result = dataModel.migrate(makeDataVersioned("legacy", { count: 42 }));
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ count: 0, label: "" });
    expect(result.warning).toBe(`Unknown version 'legacy'`);
  });

  it("uses recover() for unknown versions", () => {
    const Version = defineDataVersions({
      V1: "v1",
      V2: "v2",
    });

    type VersionedData = {
      [Version.V1]: { count: number };
      [Version.V2]: { count: number; label: string };
    };

    const dataModel = new DataModelBuilder<VersionedData>()
      .from(Version.V1)
      .migrate(Version.V2, (v1) => ({ ...v1, label: "" }))
      .recover((version, data) => {
        if (version === "legacy" && typeof data === "object" && data !== null && "count" in data) {
          return { count: (data as { count: number }).count, label: "recovered" };
        }
        return defaultRecover(version, data);
      })
      .init(() => ({ count: 0, label: "" }));

    const result = dataModel.migrate(makeDataVersioned("legacy", { count: 7 }));
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ count: 7, label: "recovered" });
    expect(result.warning).toBeUndefined();
  });

  it("allows recover() to delegate to defaultRecover", () => {
    const Version = defineDataVersions({
      V1: "v1",
      V2: "v2",
    });

    type VersionedData = {
      [Version.V1]: { count: number };
      [Version.V2]: { count: number; label: string };
    };

    const dataModel = new DataModelBuilder<VersionedData>()
      .from(Version.V1)
      .migrate(Version.V2, (v1) => ({ ...v1, label: "" }))
      .recover((version, data) => defaultRecover(version, data))
      .init(() => ({ count: 0, label: "" }));

    const result = dataModel.migrate(makeDataVersioned("legacy", { count: 7 }));
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ count: 0, label: "" });
    expect(result.warning).toBe(`Unknown version 'legacy'`);
  });

  it("returns initial data on migration failure", () => {
    const Version = defineDataVersions({
      V1: "v1",
      V2: "v2",
    });

    type VersionedData = {
      [Version.V1]: { numbers: number[] };
      [Version.V2]: { numbers: number[]; label: string };
    };

    const dataModel = new DataModelBuilder<VersionedData>()
      .from(Version.V1)
      .migrate(Version.V2, (v1) => {
        if (v1.numbers.includes(666)) {
          throw new Error("Forbidden number");
        }
        return { ...v1, label: "ok" };
      })
      .init(() => ({ numbers: [], label: "" }));

    const result = dataModel.migrate(makeDataVersioned("v1", { numbers: [666] }));
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ numbers: [], label: "" });
    expect(result.warning).toBe(`Migration v1→v2 failed: Forbidden number`);
  });
});

function _compileTimeTypeChecks() {
  const Version = defineDataVersions({
    V1: "v1",
    V2: "v2",
  });

  type VersionedData = {
    [Version.V1]: { count: number };
    [Version.V2]: { count: number; label: string };
  };

  // Valid: complete migration chain
  new DataModelBuilder<VersionedData>()
    .from(Version.V1)
    .migrate(Version.V2, (v1) => ({ ...v1, label: "" }))
    .init(() => ({ count: 0, label: "" }));

  // Valid: with recover()
  new DataModelBuilder<VersionedData>()
    .from(Version.V1)
    .migrate(Version.V2, (v1) => ({ ...v1, label: "" }))
    .recover((version, data) => defaultRecover(version, data))
    .init(() => ({ count: 0, label: "" }));

  new DataModelBuilder<VersionedData>()
    // @ts-expect-error invalid initial version key
    .from("v3");

  new DataModelBuilder<VersionedData>()
    .from(Version.V1)
    // @ts-expect-error invalid migration target key
    .migrate("v3", (v1) => ({ ...v1, label: "" }));

  new DataModelBuilder<VersionedData>()
    .from(Version.V1)
    // @ts-expect-error migration return type must match target version
    .migrate(Version.V2, (v1) => ({ ...v1, invalid: true }));

  // Incomplete migration chain - V2 not covered
  // This errors at compile-time with the `this` parameter constraint:
  // "The 'this' context of type 'DataModelMigrationChain<..., "v1", "v2">' is not assignable to method's 'this' of type 'DataModelMigrationChain<..., "v1", never>'"
  // Note: @ts-expect-error doesn't work reliably in unused functions
  // new DataModelBuilder<VersionedData>()
  //   .from(Version.V1)
  //   .init(() => ({ count: 0 }));

  new DataModelBuilder<VersionedData>()
    .from(Version.V1)
    .migrate(Version.V2, (v1) => ({ ...v1, label: "" }))
    .recover((version, data) => defaultRecover(version, data))
    // @ts-expect-error recover() returns builder without recover() method - cannot call twice (only init() available)
    .recover((version, data) => defaultRecover(version, data));

  new DataModelBuilder<VersionedData>()
    .from(Version.V1)
    .recover((version, data) => defaultRecover(version, data))
    // @ts-expect-error recover() returns builder without migrate() method (only init() available)
    .migrate(Version.V2, (v1) => ({ ...v1, label: "" }));
}
