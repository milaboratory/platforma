import { describe, expect, it } from "vitest";
import {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  DATA_MODEL_DEFAULT_VERSION,
  createBlockStorage,
  defaultBlockStorageHandlers,
  getPluginData,
  getPlugins,
  getStorageData,
  getStorageDataVersion,
  isBlockStorage,
  mergeBlockStorageHandlers,
  migrateBlockStorage,
  normalizeBlockStorage,
  setPlugins,
  updateStorageData,
  updateStorageDataVersion,
  type MutateStoragePayload,
  type PluginName,
  type PluginRegistry,
  type VersionedData,
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
        operation: "update-plugin",
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

    it("getStorageDataVersion should return the version", () => {
      expect(getStorageDataVersion(storage)).toBe("v3");
    });

    it("updateStorageData should return new storage with updated data", () => {
      const newStorage = updateStorageData(storage, {
        operation: "update-data",
        value: { count: 100 },
      });
      expect(newStorage.__data).toEqual({ count: 100 });
      expect(newStorage.__dataVersion).toBe("v3");
      expect(newStorage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      // Original should be unchanged
      expect(storage.__data).toEqual({ count: 42 });
    });

    it("updateStorageDataVersion should return new storage with updated version", () => {
      const newStorage = updateStorageDataVersion(storage, "v5");
      expect(newStorage.__dataVersion).toBe("v5");
      expect(newStorage.__data).toEqual({ count: 42 });
      expect(newStorage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      // Original should be unchanged
      expect(storage.__dataVersion).toBe("v3");
    });
  });

  describe("Plugin data functions (migration)", () => {
    const baseStorage = createBlockStorage({});

    it("getPlugins should return empty object when not set", () => {
      expect(getPlugins(baseStorage)).toEqual({});
    });

    it("setPlugins should set all plugin entries", () => {
      const plugins = {
        table1: { __dataVersion: "v1", __data: { columns: ["a"] } },
        chart1: { __dataVersion: "v2", __data: { type: "bar" } },
      };
      const storage = setPlugins(baseStorage, plugins);
      expect(storage.__plugins).toEqual(plugins);
    });

    it("setPlugins should replace existing plugins", () => {
      const oldPlugins = { old: { __dataVersion: "v1", __data: {} } };
      const newPlugins = { new: { __dataVersion: "v2", __data: { fresh: true } } };
      let storage = setPlugins(baseStorage, oldPlugins);
      storage = setPlugins(storage, newPlugins);
      expect(storage.__plugins).toEqual(newPlugins);
    });

    it("setPlugins should set __plugins to empty record when empty", () => {
      const plugins = { table1: { __dataVersion: "v1", __data: {} } };
      let storage = setPlugins(baseStorage, plugins);
      storage = setPlugins(storage, {});
      expect(storage.__plugins).toEqual({});
    });

    it("should not modify original storage (immutability)", () => {
      const plugins = { table1: { __dataVersion: "v1", __data: {} } };
      const storage = setPlugins(baseStorage, plugins);
      expect(baseStorage.__plugins).toEqual({});
      expect(storage.__plugins).toEqual(plugins);
    });
  });

  describe("Plugin data functions (UI)", () => {
    const baseStorage = createBlockStorage({});

    it("update-plugin operation should add plugin data with default version", () => {
      const storage = updateStorageData(baseStorage, {
        operation: "update-plugin",
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
      const plugins = { table1: { __dataVersion: "v5", __data: { old: true } } };
      let storage = setPlugins(baseStorage, plugins);
      storage = updateStorageData(storage, {
        operation: "update-plugin",
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
        operation: "update-plugin",
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
        operation: "update-plugin",
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
        operation: "update-data",
        value: { count: 2 },
      });
      expect(updated.__data).toEqual({ count: 2 });
    });

    it("update-plugin operation should update plugin data", () => {
      const storage = createBlockStorage({});
      const updated = updateStorageData(storage, {
        operation: "update-plugin",
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

  describe("BlockStorageHandlers", () => {
    describe("defaultBlockStorageHandlers", () => {
      it("transformStateForStorage should replace data", () => {
        const storage = createBlockStorage("old");
        const result = defaultBlockStorageHandlers.transformStateForStorage(storage, "new");
        expect(result.__data).toBe("new");
        expect(result.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      });

      it("deriveStateForArgs should return data directly", () => {
        const storage = createBlockStorage({ data: "test" });
        expect(defaultBlockStorageHandlers.deriveStateForArgs(storage)).toEqual({ data: "test" });
      });

      it("migrateStorage should update version only", () => {
        const storage = createBlockStorage({ data: "test" });
        const result = defaultBlockStorageHandlers.migrateStorage(storage, "v1", "v3");
        expect(result.__dataVersion).toBe("v3");
        expect(result.__data).toEqual({ data: "test" });
      });
    });

    describe("mergeBlockStorageHandlers", () => {
      it("should return defaults when no custom handlers provided", () => {
        const handlers = mergeBlockStorageHandlers();
        expect(handlers.transformStateForStorage).toBe(
          defaultBlockStorageHandlers.transformStateForStorage,
        );
        expect(handlers.deriveStateForArgs).toBe(defaultBlockStorageHandlers.deriveStateForArgs);
        expect(handlers.migrateStorage).toBe(defaultBlockStorageHandlers.migrateStorage);
      });

      it("should override with custom handlers", () => {
        const customTransform = <T>(
          storage: ReturnType<typeof createBlockStorage<T>>,
          data: T,
        ) => ({
          ...storage,
          __data: data,
          __dataVersion: `${storage.__dataVersion}-next`,
        });

        const handlers = mergeBlockStorageHandlers({
          transformStateForStorage: customTransform,
        });

        expect(handlers.transformStateForStorage).toBe(customTransform);
        expect(handlers.deriveStateForArgs).toBe(defaultBlockStorageHandlers.deriveStateForArgs);
      });
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
        migrateBlockData: (data, fromVersion) => {
          const d = data as { count: number };
          return { data: { count: d.count + 1 }, version: "v2" };
        },
        migratePluginData: (pluginId, pluginName, entry) => ({
          __dataVersion: "v2",
          __data: { value: "migrated" },
        }),
        newPluginRegistry: newRegistry,
        createPluginData: () => ({ __dataVersion: "v1", __data: {} }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__data).toEqual({ count: 2 });
        expect(result.storage.__dataVersion).toBe("v2");
        expect(result.storage.__plugins?.plugin1).toEqual({
          __dataVersion: "v2",
          __data: { value: "migrated" },
        });
        expect(result.warnings).toEqual([]);
      }
    });

    it("should return failure and preserve original storage when block migration throws", () => {
      const storage = createTestStorage();
      const originalData = storage.__data;

      const result = migrateBlockStorage(storage, {
        migrateBlockData: () => {
          throw new Error("Block migration failed");
        },
        migratePluginData: () => ({ __dataVersion: "v1", __data: {} }),
        newPluginRegistry: {},
        createPluginData: () => ({ __dataVersion: "v1", __data: {} }),
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
        migrateBlockData: (data, fromVersion) => ({
          data: data as { count: number },
          version: "v2",
        }),
        migratePluginData: (pluginId) => {
          throw new Error(`Plugin ${pluginId} migration failed`);
        },
        newPluginRegistry: newRegistry,
        createPluginData: () => ({ __dataVersion: "v1", __data: {} }),
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
        migrateBlockData: (data) => ({ data: data as { count: number }, version: "v2" }),
        migratePluginData: () => {
          throw new Error("Should not be called for type change");
        },
        newPluginRegistry: newRegistry,
        createPluginData: (pluginId, pluginName) => ({
          __dataVersion: "v1",
          __data: { fresh: true, type: pluginName },
        }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__plugins?.plugin1).toEqual({
          __dataVersion: "v1",
          __data: { fresh: true, type: "typeB" },
        });
        expect(result.warnings).toContain(
          "Plugin 'plugin1' type changed from 'typeA' to 'typeB', data reset",
        );
      }
    });

    it("should create initial data for new plugins", () => {
      const storage = createBlockStorage({ count: 1 }, "v1");
      const newRegistry: PluginRegistry = { newPlugin: "typeNew" as PluginName };

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (data) => ({ data: data as { count: number }, version: "v2" }),
        migratePluginData: () => {
          throw new Error("Should not be called for new plugin");
        },
        newPluginRegistry: newRegistry,
        createPluginData: (pluginId, pluginName) => ({
          __dataVersion: "v1",
          __data: { initialized: true },
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

    it("should remove orphaned plugins and add warning", () => {
      const storage = createTestStorage();
      const newRegistry: PluginRegistry = {}; // Empty - removes plugin1

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (data) => ({ data: data as { count: number }, version: "v2" }),
        migratePluginData: () => ({ __dataVersion: "v1", __data: {} }),
        newPluginRegistry: newRegistry,
        createPluginData: () => ({ __dataVersion: "v1", __data: {} }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__plugins).toEqual({});
        expect(result.storage.__pluginRegistry).toEqual({});
        expect(result.warnings).toContain("Plugin 'plugin1' removed (no longer in registry)");
      }
    });

    it("should allow plugin migration to return undefined to remove plugin", () => {
      const storage = createTestStorage();
      const newRegistry: PluginRegistry = { plugin1: "typeA" as PluginName };

      const result = migrateBlockStorage(storage, {
        migrateBlockData: (data) => ({ data: data as { count: number }, version: "v2" }),
        migratePluginData: () => undefined, // Remove plugin
        newPluginRegistry: newRegistry,
        createPluginData: () => ({ __dataVersion: "v1", __data: {} }),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.storage.__plugins).toEqual({});
      }
    });
  });

  describe("Combined plugin and block data operations", () => {
    it("should support plugin migration workflow (transactional)", () => {
      let storage = createBlockStorage({ blockData: "test" });

      // Simulate migration: set all plugins together (transactional)
      const plugins = {
        mainTable: { __dataVersion: "v1", __data: { columns: ["id", "name"] } },
        sideChart: { __dataVersion: "v2", __data: { type: "bar" } },
      };
      storage = setPlugins(storage, plugins);

      // Verify state
      expect(getPlugins(storage)).toEqual(plugins);
      expect(getPluginData(storage, "mainTable")).toEqual({ columns: ["id", "name"] });
      expect(getPluginData(storage, "sideChart")).toEqual({ type: "bar" });

      // Simulate removing all plugins during migration
      storage = setPlugins(storage, {});

      // Verify removal
      expect(getPlugins(storage)).toEqual({});
      expect(storage.__plugins).toEqual({});
    });

    it("should support UI updating plugin data without affecting version", () => {
      // Setup: migration sets plugins
      const plugins = { table1: { __dataVersion: "v3", __data: { state: "initial" } } };
      let storage = createBlockStorage({});
      storage = setPlugins(storage, plugins);

      // UI updates plugin data - version should be preserved
      storage = updateStorageData(storage, {
        operation: "update-plugin",
        pluginId: "table1",
        value: { state: "updated" },
      });

      expect(storage.__plugins?.table1).toEqual({
        __dataVersion: "v3", // preserved
        __data: { state: "updated" },
      });
    });

    it("should preserve block data when manipulating plugins", () => {
      let storage = createBlockStorage({ important: "data" }, "v5");

      const plugins = { plugin1: { __dataVersion: "v1", __data: { pluginData: true } } };
      storage = setPlugins(storage, plugins);

      expect(storage.__data).toEqual({ important: "data" });
      expect(storage.__dataVersion).toBe("v5");

      storage = setPlugins(storage, {});

      expect(storage.__data).toEqual({ important: "data" });
      expect(storage.__dataVersion).toBe("v5");
    });
  });
});
