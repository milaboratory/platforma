import { describe, expect, it } from "vitest";
import { DataModelBuilder, defaultRecover, makeDataVersioned } from "./block_migrations";

describe("makeDataVersioned", () => {
  it("creates correct DataVersioned shape", () => {
    const versioned = makeDataVersioned("v1", { count: 42 });
    expect(versioned).toStrictEqual({ version: "v1", data: { count: 42 } });
  });
});

describe("DataModel migrations", () => {
  it("resets to initial data on unknown version", () => {
    const dataModel = new DataModelBuilder()
      .from<{ count: number }>("v1")
      .migrate<{ count: number; label: string }>("v2", (v1) => ({ ...v1, label: "" }))
      .init(() => ({ count: 0, label: "" }));

    const result = dataModel.migrate(makeDataVersioned("legacy", { count: 42 }));
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ count: 0, label: "" });
    expect(result.warning).toBe(`Unknown version 'legacy'`);
  });

  it("returns initial data on migration failure", () => {
    const dataModel = new DataModelBuilder()
      .from<{ numbers: number[] }>("v1")
      .migrate<{ numbers: number[]; label: string }>("v2", (v1) => {
        if (v1.numbers.includes(666)) throw new Error("Forbidden number");
        return { ...v1, label: "ok" };
      })
      .init(() => ({ numbers: [], label: "" }));

    const result = dataModel.migrate(makeDataVersioned("v1", { numbers: [666] }));
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ numbers: [], label: "" });
    expect(result.warning).toBe(`Migration v1→v2 failed: Forbidden number`);
  });

  describe("recover()", () => {
    it("recover() after from() — handles unknown version before any migrations run", () => {
      const dataModel = new DataModelBuilder()
        .from<{ count: number }>("v1")
        .recover((version, data) => {
          if (
            version === "legacy" &&
            typeof data === "object" &&
            data !== null &&
            "count" in data
          ) {
            return { count: (data as { count: number }).count };
          }
          return defaultRecover(version, data);
        })
        .migrate<{ count: number; label: string }>("v2", (v1) => ({ ...v1, label: "default" }))
        .init(() => ({ count: 0, label: "" }));

      // Legacy data is recovered as V1 then goes through v1→v2 migration
      const result = dataModel.migrate(makeDataVersioned("legacy", { count: 5 }));
      expect(result.version).toBe("v2");
      expect(result.data).toStrictEqual({ count: 5, label: "default" });
      expect(result.warning).toBeUndefined();
    });

    it("recover() between migrations — recovered data goes through subsequent migrations", () => {
      type V2 = { count: number; label: string };
      type V3 = { count: number; label: string; description: string };

      const dataModel = new DataModelBuilder()
        .from<{ count: number }>("v1")
        .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
        .recover((version, data) => {
          if (
            version === "legacy" &&
            typeof data === "object" &&
            data !== null &&
            "count" in data
          ) {
            // Returns V2 — the migration to V3 will still run
            return { count: (data as { count: number }).count, label: "recovered" };
          }
          return defaultRecover(version, data);
        })
        .migrate<V3>("v3", (v2) => ({ ...v2, description: "added" }))
        .init(() => ({ count: 0, label: "", description: "" }));

      // Legacy → recover produces V2 → v2→v3 migration runs → final is V3
      const result = dataModel.migrate(makeDataVersioned("legacy", { count: 7 }));
      expect(result.version).toBe("v3");
      expect(result.data).toStrictEqual({ count: 7, label: "recovered", description: "added" });
      expect(result.warning).toBeUndefined();
    });

    it("recover() at the end of chain — recovered data is the final type", () => {
      type V2 = { count: number; label: string };

      const dataModel = new DataModelBuilder()
        .from<{ count: number }>("v1")
        .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
        .recover((version, data) => {
          if (
            version === "legacy" &&
            typeof data === "object" &&
            data !== null &&
            "count" in data
          ) {
            return { count: (data as { count: number }).count, label: "recovered" };
          }
          return defaultRecover(version, data);
        })
        .init(() => ({ count: 0, label: "" }));

      const result = dataModel.migrate(makeDataVersioned("legacy", { count: 9 }));
      expect(result.version).toBe("v2");
      expect(result.data).toStrictEqual({ count: 9, label: "recovered" });
      expect(result.warning).toBeUndefined();
    });

    it("recover() delegates to defaultRecover for truly unknown versions", () => {
      const dataModel = new DataModelBuilder()
        .from<{ count: number }>("v1")
        .migrate<{ count: number; label: string }>("v2", (v1) => ({ ...v1, label: "" }))
        .recover((version, data) => defaultRecover(version, data))
        .init(() => ({ count: 0, label: "" }));

      const result = dataModel.migrate(makeDataVersioned("unknown", { count: 7 }));
      expect(result.version).toBe("v2");
      expect(result.data).toStrictEqual({ count: 0, label: "" });
      expect(result.warning).toBe(`Unknown version 'unknown'`);
    });

    it("migration failure after recover() resets to initial data", () => {
      type V2 = { count: number; label: string };
      type V3 = { count: number; label: string; description: string };

      const dataModel = new DataModelBuilder()
        .from<{ count: number }>("v1")
        .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
        .recover((version, data) => {
          if (
            version === "legacy" &&
            typeof data === "object" &&
            data !== null &&
            "count" in data
          ) {
            return { count: (data as { count: number }).count, label: "recovered" };
          }
          return defaultRecover(version, data);
        })
        .migrate<V3>("v3", (_v2) => {
          throw new Error("v3 failed");
        })
        .init(() => ({ count: 0, label: "", description: "" }));

      const result = dataModel.migrate(makeDataVersioned("legacy", { count: 7 }));
      expect(result.version).toBe("v3");
      expect(result.data).toStrictEqual({ count: 0, label: "", description: "" });
      expect(result.warning).toBe("Migration v2→v3 failed: v3 failed");
    });
  });
});

function _compileTimeTypeChecks() {
  type V1 = { count: number };
  type V2 = { count: number; label: string };
  type V3 = { count: number; label: string; description: string };

  // Valid: chain without recover
  new DataModelBuilder()
    .from<V1>("v1")
    .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
    .init(() => ({ count: 0, label: "" }));

  // Valid: recover() after from(), then migrate()
  new DataModelBuilder()
    .from<V1>("v1")
    .recover((_version, _data) => ({ count: 0 }))
    .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
    .init(() => ({ count: 0, label: "" }));

  // Valid: recover() between migrations
  new DataModelBuilder()
    .from<V1>("v1")
    .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
    .recover((version, data) => defaultRecover(version, data))
    .migrate<V3>("v3", (v2) => ({ ...v2, description: "" }))
    .init(() => ({ count: 0, label: "", description: "" }));

  // Valid: recover() at the end of chain
  new DataModelBuilder()
    .from<V1>("v1")
    .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
    .recover((version, data) => defaultRecover(version, data))
    .init(() => ({ count: 0, label: "" }));

  // @ts-expect-error recover() cannot be called twice
  new DataModelBuilder()
    .from<V1>("v1")
    .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
    .recover((version, data) => defaultRecover(version, data))
    .recover((version, data) => defaultRecover(version, data));

  // @ts-expect-error recover() cannot be called twice — even after from()
  new DataModelBuilder()
    .from<V1>("v1")
    .recover((_version, _data) => ({ count: 0 }))
    .recover((_version, _data) => ({ count: 0 }));

  // @ts-expect-error duplicate version key is a compile-time error
  new DataModelBuilder()
    .from<V1>("v1")
    .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
    .migrate<V3>("v1", (v2) => ({ ...v2, description: "" }));

  // @ts-expect-error duplicate version key also detected after recover()
  new DataModelBuilder()
    .from<V1>("v1")
    .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
    .recover((version, data) => defaultRecover(version, data))
    .migrate<V3>("v2", (v2) => ({ ...v2, description: "" }));

  const nonLiteralVersion = "v2" as string;

  // @ts-expect-error non-literal string variable rejected in from()
  new DataModelBuilder().from<V1>(nonLiteralVersion);

  // @ts-expect-error non-literal string variable rejected in migrate()
  new DataModelBuilder()
    .from<V1>("v1")
    .migrate<V2>(nonLiteralVersion, (v1) => ({ ...v1, label: "" }));

  // @ts-expect-error non-literal string variable rejected in migrate() after recover()
  new DataModelBuilder()
    .from<V1>("v1")
    .recover((_version, _data) => ({ count: 0 }))
    .migrate<V2>(nonLiteralVersion, (v1) => ({ ...v1, label: "" }));
}
