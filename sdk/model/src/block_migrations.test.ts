import { describe, expect, it } from "vitest";
import { DataModelBuilder, defaultRecover, makeDataVersioned } from "./block_migrations";
import { DATA_MODEL_LEGACY_VERSION } from "./block_storage";

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
  });

  it("throws at build time on duplicate version key", () => {
    expect(() =>
      new DataModelBuilder()
        .from<{ count: number }>("v1")
        .migrate<{ count: number; label: string }>("v2", (v1) => ({ ...v1, label: "" }))
        .migrate<{ count: number; label: string; description: string }>("v1", (v2) => ({
          ...v2,
          description: "",
        })),
    ).toThrow("Duplicate version 'v1' in migration chain");
  });

  it("throws on migration failure", () => {
    const dataModel = new DataModelBuilder()
      .from<{ numbers: number[] }>("v1")
      .migrate<{ numbers: number[]; label: string }>("v2", (v1) => {
        if (v1.numbers.includes(666)) throw new Error("Forbidden number");
        return { ...v1, label: "ok" };
      })
      .init(() => ({ numbers: [], label: "" }));

    expect(() => dataModel.migrate(makeDataVersioned("v1", { numbers: [666] }))).toThrow(
      "Forbidden number",
    );
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
            return { count: (data as { count: number }).count, label: "recovered" };
          }
          return defaultRecover(version, data);
        })
        .migrate<V3>("v3", (v2) => ({ ...v2, description: "added" }))
        .init(() => ({ count: 0, label: "", description: "" }));

      const result = dataModel.migrate(makeDataVersioned("legacy", { count: 7 }));
      expect(result.version).toBe("v3");
      expect(result.data).toStrictEqual({ count: 7, label: "recovered", description: "added" });
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
    });

    it("recover() delegates to defaultRecover for truly unknown versions — resets to initial data", () => {
      const dataModel = new DataModelBuilder()
        .from<{ count: number }>("v1")
        .migrate<{ count: number; label: string }>("v2", (v1) => ({ ...v1, label: "" }))
        .recover((version, data) => defaultRecover(version, data))
        .init(() => ({ count: 0, label: "" }));

      const result = dataModel.migrate(makeDataVersioned("unknown", { count: 7 }));
      expect(result.version).toBe("v2");
      expect(result.data).toStrictEqual({ count: 0, label: "" });
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
    });

    it("recover() cannot be called twice — enforced by type (no recover() on WithRecover)", () => {
      // This is a compile-time-only check — WithRecover has no recover() method.
      // Verified by the absence of recover() in DataModelMigrationChainWithRecover.
    });
  });

  describe("upgradeLegacy()", () => {
    type LegacyArgs = { inputFile: string; threshold: number };
    type LegacyUiState = { selectedTab: string };
    type BlockData = { inputFile: string; threshold: number; selectedTab: string };

    it("upgrades legacy { args, uiState } data with custom initial version", () => {
      const dataModel = new DataModelBuilder()
        .from<BlockData>("v1")
        .upgradeLegacy<LegacyArgs, LegacyUiState>(({ args, uiState }) => ({
          inputFile: args.inputFile,
          threshold: args.threshold,
          selectedTab: uiState.selectedTab,
        }))
        .init(() => ({ inputFile: "", threshold: 0, selectedTab: "main" }));

      // Legacy data arrives at DATA_MODEL_LEGACY_VERSION (how normalizeBlockStorage wraps it)
      const result = dataModel.migrate(
        makeDataVersioned(DATA_MODEL_LEGACY_VERSION, {
          args: { inputFile: "test.fa", threshold: 5 },
          uiState: { selectedTab: "results" },
        }),
      );
      expect(result.version).toBe("v1");
      expect(result.data).toStrictEqual({
        inputFile: "test.fa",
        threshold: 5,
        selectedTab: "results",
      });
    });

    it("passes through non-legacy data at custom initial version unchanged", () => {
      const dataModel = new DataModelBuilder()
        .from<BlockData>("v1")
        .upgradeLegacy<LegacyArgs, LegacyUiState>(({ args, uiState }) => ({
          inputFile: args.inputFile,
          threshold: args.threshold,
          selectedTab: uiState.selectedTab,
        }))
        .init(() => ({ inputFile: "", threshold: 0, selectedTab: "main" }));

      // Non-legacy data at the user's version passes through unchanged
      const result = dataModel.migrate(
        makeDataVersioned("v1", {
          inputFile: "existing.fa",
          threshold: 10,
          selectedTab: "overview",
        }),
      );
      expect(result.version).toBe("v1");
      expect(result.data).toStrictEqual({
        inputFile: "existing.fa",
        threshold: 10,
        selectedTab: "overview",
      });
    });

    it("upgrades legacy data and runs subsequent migrations", () => {
      type BlockDataV2 = BlockData & { description: string };

      const dataModel = new DataModelBuilder()
        .from<BlockData>("v1")
        .upgradeLegacy<LegacyArgs, LegacyUiState>(({ args, uiState }) => ({
          inputFile: args.inputFile,
          threshold: args.threshold,
          selectedTab: uiState.selectedTab,
        }))
        .migrate<BlockDataV2>("v2", (v1) => ({ ...v1, description: "auto" }))
        .init(() => ({ inputFile: "", threshold: 0, selectedTab: "main", description: "" }));

      const result = dataModel.migrate(
        makeDataVersioned(DATA_MODEL_LEGACY_VERSION, {
          args: { inputFile: "test.fa", threshold: 3 },
          uiState: { selectedTab: "tab1" },
        }),
      );
      expect(result.version).toBe("v2");
      expect(result.data).toStrictEqual({
        inputFile: "test.fa",
        threshold: 3,
        selectedTab: "tab1",
        description: "auto",
      });
    });

    it("throws when legacy upgrade fails", () => {
      const dataModel = new DataModelBuilder()
        .from<BlockData>("v1")
        .upgradeLegacy<LegacyArgs, LegacyUiState>(() => {
          throw new Error("bad legacy data");
        })
        .init(() => ({ inputFile: "", threshold: 0, selectedTab: "main" }));

      expect(() =>
        dataModel.migrate(
          makeDataVersioned(DATA_MODEL_LEGACY_VERSION, {
            args: { inputFile: "test.fa", threshold: 5 },
            uiState: { selectedTab: "results" },
          }),
        ),
      ).toThrow("bad legacy data");
    });
  });
});
