import { describe, expect, it } from "vitest";
import {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  DATA_MODEL_DEFAULT_VERSION,
  createBlockStorage,
  getPluginData,
  getStorageData,
  isBlockStorage,
  migrateBlockStorage,
  normalizeBlockStorage,
  updateStorageData,
  type MutateStoragePayload,
  type PluginName,
  type PluginRegistry,
} from "./block_storage";

describe("BlockStorage", () => {
  describe("BLOCK_STORAGE_KEY and BLOCK_STORAGE_SCHEMA_VERSION", () => {
    it("should have correct key constant", () => {
      expect(typeof BLOCK_STORAGE_KEY).toBe("string");
      expect(BLOCK_STORAGE_KEY).toBe("__pl_a7f3e2b9__");
    });

    it("should have correct schema version", () => {
      expect(BLOCK_STORAGE_SCHEMA_VERSION).toBe("v1");
    });
  });

  describe("isBlockStorage", () => {
    it("should return true for valid BlockStorage with discriminator", () => {
      const storage = createBlockStorage({});
      expect(isBlockStorage(storage)).toBe(true);
    });

    it("should return true for BlockStorage with plugin data", () => {
      const storage = updateStorageData(createBlockStorage({ foo: "bar" }), {
        operation: "update-plugin-data",
        pluginId: "testPlugin",
        value: { data: 123 },
      });
      expect(isBlockStorage(storage)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isBlockStorage(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isBlockStorage(undefined)).toBe(false);
    });

    it("should return false for primitive values", () => {
      expect(isBlockStorage(42)).toBe(false);
      expect(isBlockStorage("string")).toBe(false);
      expect(isBlockStorage(true)).toBe(false);
    });

    it("should return false for objects without discriminator", () => {
      expect(isBlockStorage({ __dataVersion: "v1", __data: {} })).toBe(false);
    });

    it("should return false for objects with wrong discriminator value", () => {
      expect(
        isBlockStorage({ [BLOCK_STORAGE_KEY]: "wrong", __dataVersion: "v1", __data: {} }),
      ).toBe(false);
    });
  });

  describe("createBlockStorage", () => {
    it("should create storage with discriminator key and default values", () => {
      const storage = createBlockStorage();
      expect(storage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(storage.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(storage.__data).toEqual({});
    });

    it("should create storage with custom initial data", () => {
      const data = { numbers: [1, 2, 3] };
      const storage = createBlockStorage(data);
      expect(storage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(storage.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(storage.__data).toEqual(data);
    });

    it("should create storage with custom version", () => {
      const storage = createBlockStorage({ foo: "bar" }, "v5");
      expect(storage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(storage.__dataVersion).toBe("v5");
      expect(storage.__data).toEqual({ foo: "bar" });
    });

    it("should create storage with empty plugin fields by default", () => {
      const storage = createBlockStorage({});
      expect(storage.__pluginRegistry).toEqual({});
      expect(storage.__plugins).toEqual({});
    });
  });

  describe("normalizeBlockStorage", () => {
    it("should return BlockStorage as-is with plugin defaults added", () => {
      const storage = createBlockStorage({ data: "test" }, "v2");
      const normalized = normalizeBlockStorage(storage);
      expect(normalized).toEqual(storage);
      expect(normalized.__pluginRegistry).toEqual({});
      expect(normalized.__plugins).toEqual({});
    });

    it("should add plugin defaults to BlockStorage without them", () => {
      // Simulate storage from earlier version without plugin fields
      const oldStorage = {
        [BLOCK_STORAGE_KEY]: "v1" as const,
        __dataVersion: "v2",
        __data: { data: "test" },
      };
      const normalized = normalizeBlockStorage(oldStorage);
      expect(normalized.__pluginRegistry).toEqual({});
      expect(normalized.__plugins).toEqual({});
    });

    it("should preserve existing plugin data when normalizing", () => {
      const storageWithPlugins = {
        [BLOCK_STORAGE_KEY]: "v1" as const,
        __dataVersion: "v2",
        __data: { data: "test" },
        __pluginRegistry: { p1: "plugin1" as PluginName },
        __plugins: { p1: { __dataVersion: "v1", __data: { foo: "bar" } } },
      };
      const normalized = normalizeBlockStorage(storageWithPlugins);
      expect(normalized.__pluginRegistry).toEqual({ p1: "plugin1" as PluginName });
      expect(normalized.__plugins).toEqual({ p1: { __dataVersion: "v1", __data: { foo: "bar" } } });
    });

    it("should wrap legacy data in BlockStorage structure", () => {
      const legacyData = { numbers: [1, 2, 3], name: "test" };
      const normalized = normalizeBlockStorage(legacyData);
      expect(normalized[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(normalized.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(normalized.__data).toEqual(legacyData);
      expect(normalized.__pluginRegistry).toEqual({});
      expect(normalized.__plugins).toEqual({});
    });

    it("should wrap primitive legacy data", () => {
      const normalized = normalizeBlockStorage("simple string");
      expect(normalized[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(normalized.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(normalized.__data).toBe("simple string");
    });

    it("should wrap null legacy data", () => {
      const normalized = normalizeBlockStorage(null);
      expect(normalized[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(normalized.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(normalized.__data).toBeNull();
    });
  });

  describe("Data access functions", () => {
    const storage = createBlockStorage({ count: 42 }, "v3");

    it("getStorageData should return the data", () => {
      expect(getStorageData(storage)).toEqual({ count: 42 });
    });

    it("updateStorageData should return new storage with updated data", () => {
      const newStorage = updateStorageData(storage, {
        operation: "update-block-data",
        value: { count: 100 },
      });
      expect(newStorage.__data).toEqual({ count: 100 });
      expect(newStorage.__dataVersion).toBe("v3");
      expect(newStorage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      // Original should be unchanged
      expect(storage.__data).toEqual({ count: 42 });
    });
  });

  describe("Plugin data functions (UI)", () => {
    const baseStorage = createBlockStorage({});

    it("update-plugin operation should add plugin data with default version", () => {
      const storage = updateStorageData(baseStorage, {
        operation: "update-plugin-data",
        pluginId: "table1",
        value: { columns: ["a", "b"] },
      });
      expect(storage.__plugins).toEqual({
        table1: {
          __dataVersion: DATA_MODEL_DEFAULT_VERSION,
          __data: { columns: ["a", "b"] },
        },
      });
    });

    it("update-plugin operation should preserve existing version when updating", () => {
      let storage = {
        ...baseStorage,
        __plugins: { table1: { __dataVersion: "v5", __data: { old: true } } },
      };
      storage = updateStorageData(storage, {
        operation: "update-plugin-data",
        pluginId: "table1",
        value: { new: true },
      });
      expect(storage.__plugins?.table1).toEqual({
        __dataVersion: "v5",
        __data: { new: true },
      });
    });

    it("getPluginData should retrieve plugin data", () => {
      const storage = updateStorageData(baseStorage, {
        operation: "update-plugin-data",
        pluginId: "chart1",
        value: { type: "bar" },
      });
      expect(getPluginData(storage, "chart1")).toEqual({ type: "bar" });
    });

    it("getPluginData should return undefined for missing plugin", () => {
      expect(getPluginData(baseStorage, "nonexistent")).toBeUndefined();
    });

    it("should not modify original storage (immutability)", () => {
      const storage = updateStorageData(baseStorage, {
        operation: "update-plugin-data",
        pluginId: "table1",
        value: { data: "test" },
      });
      expect(baseStorage.__plugins).toEqual({});
      expect(storage.__plugins?.table1).toBeDefined();
    });
  });

  describe("updateStorageData operations", () => {
    it("update-data operation should update block data", () => {
      const storage = createBlockStorage({ count: 1 });
      const updated = updateStorageData(storage, {
        operation: "update-block-data",
        value: { count: 2 },
      });
      expect(updated.__data).toEqual({ count: 2 });
    });

    it("update-plugin operation should update plugin data", () => {
      const storage = createBlockStorage({});
      const updated = updateStorageData(storage, {
        operation: "update-plugin-data",
        pluginId: "plugin1",
        value: { foo: "bar" },
      });
      expect(updated.__plugins?.plugin1).toEqual({
        __dataVersion: DATA_MODEL_DEFAULT_VERSION,
        __data: { foo: "bar" },
      });
    });

    it("should throw on unknown operation", () => {
      const storage = createBlockStorage({});
      expect(() => {
        updateStorageData(storage, { operation: "invalid" } as MutateStoragePayload);
      }).toThrow("Unknown storage operation: invalid");
    });
  });

  describe("Atomic migration (migrateBlockStorage)", () => {
    const createTestStorage = () => {
      const storage = createBlockStorage({ count: 1 }, "v1");
      return {
        ...storage,
        __pluginRegistry: { plugin1: "typeA" as PluginName },
        __plugins: { plugin1: { __dataVersion: "v1", __data: { value: "old" } } },
      };
    };

    it("should migrate block data and plugins atomically on success", () => {
      const storage = createTestStorage();
      const newRegistry: PluginRegistry = { plugin1: "typeA" as PluginName };

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (versioned) => {
          const d = versioned.data as { count: number };
          return { data: { count: d.count + 1 }, version: "v2" };
        },
        migratePluginData: (_pluginId, _versioned) => ({
          version: "v2",
          data: { value: "migrated" },
        }),
        newPluginRegistry: newRegistry,
        createPluginData: (_pluginId) => ({ version: "v1", data: {} }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__data).toEqual({ count: 2 });
        expect(result.storage.__dataVersion).toBe("v2");
        expect(result.storage.__plugins?.plugin1).toEqual({
          __dataVersion: "v2",
          __data: { value: "migrated" },
        });
      }
    });

    it("should return failure and preserve original storage when block migration throws", () => {
      const storage = createTestStorage();
      const originalData = storage.__data;

      const result = migrateBlockStorage(storage, {
        migrateBlockData: () => {
          throw new Error("Block migration failed");
        },
        migratePluginData: (_pluginId, _versioned) => ({
          version: "v1",
          data: {},
        }),
        newPluginRegistry: {},
        createPluginData: (_pluginId) => ({ version: "v1", data: {} }),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Block migration failed");
        expect(result.failedAt).toBe("block");
      }
      // Original storage untouched
      expect(storage.__data).toEqual(originalData);
    });

    it("should return failure and preserve original storage when plugin migration throws", () => {
      const storage = createTestStorage();
      const newRegistry: PluginRegistry = { plugin1: "typeA" as PluginName };

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (versioned) => ({
          data: versioned.data as { count: number },
          version: "v2",
        }),
        migratePluginData: (pluginId) => {
          throw new Error(`Plugin ${pluginId} migration failed`);
        },
        newPluginRegistry: newRegistry,
        createPluginData: (_pluginId) => ({ version: "v1", data: {} }),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Plugin plugin1 migration failed");
        expect(result.failedAt).toBe("plugin1");
      }
    });

    it("should reset plugin data when plugin type changes", () => {
      const storage = createTestStorage();
      const newRegistry: PluginRegistry = { plugin1: "typeB" as PluginName }; // Different type

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (versioned) => ({
          data: versioned.data as { count: number },
          version: "v2",
        }),
        migratePluginData: () => {
          throw new Error("Should not be called for type change");
        },
        newPluginRegistry: newRegistry,
        createPluginData: (pluginId) => ({
          version: "v1",
          data: { fresh: true, type: newRegistry[pluginId] },
        }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__plugins?.plugin1).toEqual({
          __dataVersion: "v1",
          __data: { fresh: true, type: "typeB" },
        });
      }
    });

    it("should create initial data for new plugins", () => {
      const storage = createBlockStorage({ count: 1 }, "v1");
      const newRegistry: PluginRegistry = { newPlugin: "typeNew" as PluginName };

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (versioned) => ({
          data: versioned.data as { count: number },
          version: "v2",
        }),
        migratePluginData: () => {
          throw new Error("Should not be called for new plugin");
        },
        newPluginRegistry: newRegistry,
        createPluginData: (_pluginId) => ({
          version: "v1",
          data: { initialized: true },
        }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__plugins?.newPlugin).toEqual({
          __dataVersion: "v1",
          __data: { initialized: true },
        });
      }
    });

    it("should drop plugins not in new registry", () => {
      const storage = createTestStorage();
      const newRegistry: PluginRegistry = {}; // Empty - removes plugin1

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (versioned) => ({
          data: versioned.data as { count: number },
          version: "v2",
        }),
        migratePluginData: () => {
          throw new Error("Should not be called for dropped plugin");
        },
        newPluginRegistry: newRegistry,
        createPluginData: () => {
          throw new Error("Should not be called for dropped plugin");
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__plugins).toEqual({});
        expect(result.storage.__pluginRegistry).toEqual({});
      }
    });

    it("should allow plugin migration to return undefined to remove plugin", () => {
      const storage = createTestStorage();
      const newRegistry: PluginRegistry = { plugin1: "typeA" as PluginName };

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (versioned) => ({
          data: versioned.data as { count: number },
          version: "v2",
        }),
        migratePluginData: () => undefined, // Remove plugin
        newPluginRegistry: newRegistry,
        createPluginData: () => ({ version: "v1", data: {} }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__plugins).toEqual({});
      }
    });
  });
});
