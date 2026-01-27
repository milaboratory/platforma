import { describe, expect, it } from 'vitest';
import {
  BLOCK_STORAGE_KEY,
  BLOCK_STORAGE_SCHEMA_VERSION,
  DATA_MODEL_DEFAULT_VERSION,
  createBlockStorage,
  defaultBlockStorageHandlers,
  getFromStorage,
  getPluginData,
  getPluginNames,
  getStorageData,
  getStorageDataVersion,
  isBlockStorage,
  mergeBlockStorageHandlers,
  normalizeBlockStorage,
  removePluginData,
  setPluginData,
  updateStorageData,
  updateStorageDataVersion,
  updateStorage,
} from './block_storage';

describe('BlockStorage', () => {
  describe('BLOCK_STORAGE_KEY and BLOCK_STORAGE_SCHEMA_VERSION', () => {
    it('should have correct key constant', () => {
      expect(typeof BLOCK_STORAGE_KEY).toBe('string');
      expect(BLOCK_STORAGE_KEY).toBe('__pl_a7f3e2b9__');
    });

    it('should have correct schema version', () => {
      expect(BLOCK_STORAGE_SCHEMA_VERSION).toBe('v1');
    });
  });

  describe('isBlockStorage', () => {
    it('should return true for valid BlockStorage with discriminator', () => {
      const storage = createBlockStorage({});
      expect(isBlockStorage(storage)).toBe(true);
    });

    it('should return true for BlockStorage with plugin data', () => {
      const storage = setPluginData(createBlockStorage({ foo: 'bar' }), 'test', { data: 123 });
      expect(isBlockStorage(storage)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isBlockStorage(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isBlockStorage(undefined)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isBlockStorage(42)).toBe(false);
      expect(isBlockStorage('string')).toBe(false);
      expect(isBlockStorage(true)).toBe(false);
    });

    it('should return false for objects without discriminator', () => {
      expect(isBlockStorage({ __dataVersion: 'v1', __data: {} })).toBe(false);
    });

    it('should return false for objects with wrong discriminator value', () => {
      expect(isBlockStorage({ [BLOCK_STORAGE_KEY]: 'wrong', __dataVersion: 'v1', __data: {} })).toBe(false);
    });
  });

  describe('createBlockStorage', () => {
    it('should create storage with discriminator key and default values', () => {
      const storage = createBlockStorage();
      expect(storage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(storage.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(storage.__data).toEqual({});
    });

    it('should create storage with custom initial data', () => {
      const data = { numbers: [1, 2, 3] };
      const storage = createBlockStorage(data);
      expect(storage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(storage.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(storage.__data).toEqual(data);
    });

    it('should create storage with custom version', () => {
      const storage = createBlockStorage({ foo: 'bar' }, 'v5');
      expect(storage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(storage.__dataVersion).toBe('v5');
      expect(storage.__data).toEqual({ foo: 'bar' });
    });
  });

  describe('normalizeBlockStorage', () => {
    it('should return BlockStorage as-is', () => {
      const storage = createBlockStorage({ data: 'test' }, 'v2');
      const normalized = normalizeBlockStorage(storage);
      expect(normalized).toEqual(storage);
    });

    it('should wrap legacy data in BlockStorage structure', () => {
      const legacyData = { numbers: [1, 2, 3], name: 'test' };
      const normalized = normalizeBlockStorage(legacyData);
      expect(normalized[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(normalized.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(normalized.__data).toEqual(legacyData);
    });

    it('should wrap primitive legacy data', () => {
      const normalized = normalizeBlockStorage('simple string');
      expect(normalized[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(normalized.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(normalized.__data).toBe('simple string');
    });

    it('should wrap null legacy data', () => {
      const normalized = normalizeBlockStorage(null);
      expect(normalized[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      expect(normalized.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      expect(normalized.__data).toBeNull();
    });
  });

  describe('Data access functions', () => {
    const storage = createBlockStorage({ count: 42 }, 'v3');

    it('getStorageData should return the data', () => {
      expect(getStorageData(storage)).toEqual({ count: 42 });
    });

    it('getStorageDataVersion should return the version', () => {
      expect(getStorageDataVersion(storage)).toBe('v3');
    });

    it('updateStorageData should return new storage with updated data', () => {
      const newStorage = updateStorageData(storage, { operation: 'update-data', value: { count: 100 } });
      expect(newStorage.__data).toEqual({ count: 100 });
      expect(newStorage.__dataVersion).toBe('v3');
      expect(newStorage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      // Original should be unchanged
      expect(storage.__data).toEqual({ count: 42 });
    });

    it('updateStorageDataVersion should return new storage with updated version', () => {
      const newStorage = updateStorageDataVersion(storage, 'v5');
      expect(newStorage.__dataVersion).toBe('v5');
      expect(newStorage.__data).toEqual({ count: 42 });
      expect(newStorage[BLOCK_STORAGE_KEY]).toBe(BLOCK_STORAGE_SCHEMA_VERSION);
      // Original should be unchanged
      expect(storage.__dataVersion).toBe('v3');
    });
  });

  describe('Plugin data functions', () => {
    const baseStorage = createBlockStorage({});

    it('setPluginData should add plugin data', () => {
      const storage = setPluginData(baseStorage, 'table', { columns: ['a', 'b'] });
      expect(storage['@plugin/table']).toEqual({ columns: ['a', 'b'] });
    });

    it('getPluginData should retrieve plugin data', () => {
      const storage = setPluginData(baseStorage, 'chart', { type: 'bar' });
      expect(getPluginData(storage, 'chart')).toEqual({ type: 'bar' });
    });

    it('getPluginData should return undefined for missing plugin', () => {
      expect(getPluginData(baseStorage, 'nonexistent')).toBeUndefined();
    });

    it('removePluginData should remove plugin data', () => {
      let storage = setPluginData(baseStorage, 'toRemove', { data: 'test' });
      storage = setPluginData(storage, 'toKeep', { other: 'data' });
      const result = removePluginData(storage, 'toRemove');
      expect(result['@plugin/toRemove']).toBeUndefined();
      expect(result['@plugin/toKeep']).toEqual({ other: 'data' });
    });

    it('getPluginNames should return all plugin names', () => {
      let storage = createBlockStorage({});
      storage = setPluginData(storage, 'alpha', {});
      storage = setPluginData(storage, 'beta', {});
      storage = setPluginData(storage, 'gamma', {});
      const names = getPluginNames(storage);
      expect(names.sort()).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('getPluginNames should return empty array when no plugins', () => {
      expect(getPluginNames(baseStorage)).toEqual([]);
    });
  });

  describe('Generic storage access', () => {
    const storage = createBlockStorage('hello', 'v2');

    it('getFromStorage should get __data', () => {
      expect(getFromStorage(storage, '__data')).toBe('hello');
    });

    it('getFromStorage should get __dataVersion', () => {
      expect(getFromStorage(storage, '__dataVersion')).toBe('v2');
    });

    it('updateStorage should update any key', () => {
      const updated = updateStorage(storage, '__data', 'world');
      expect(updated.__data).toBe('world');
      expect(storage.__data).toBe('hello'); // immutable
    });
  });

  describe('BlockStorageHandlers', () => {
    describe('defaultBlockStorageHandlers', () => {
      it('transformStateForStorage should replace data', () => {
        const storage = createBlockStorage('old');
        const result = defaultBlockStorageHandlers.transformStateForStorage(storage, 'new');
        expect(result.__data).toBe('new');
        expect(result.__dataVersion).toBe(DATA_MODEL_DEFAULT_VERSION);
      });

      it('deriveStateForArgs should return data directly', () => {
        const storage = createBlockStorage({ data: 'test' });
        expect(defaultBlockStorageHandlers.deriveStateForArgs(storage)).toEqual({ data: 'test' });
      });

      it('migrateStorage should update version only', () => {
        const storage = createBlockStorage({ data: 'test' });
        const result = defaultBlockStorageHandlers.migrateStorage(storage, 'v1', 'v3');
        expect(result.__dataVersion).toBe('v3');
        expect(result.__data).toEqual({ data: 'test' });
      });
    });

    describe('mergeBlockStorageHandlers', () => {
      it('should return defaults when no custom handlers provided', () => {
        const handlers = mergeBlockStorageHandlers();
        expect(handlers.transformStateForStorage).toBe(
          defaultBlockStorageHandlers.transformStateForStorage,
        );
        expect(handlers.deriveStateForArgs).toBe(defaultBlockStorageHandlers.deriveStateForArgs);
        expect(handlers.migrateStorage).toBe(defaultBlockStorageHandlers.migrateStorage);
      });

      it('should override with custom handlers', () => {
        const customTransform = <T>(storage: ReturnType<typeof createBlockStorage<T>>, data: T) => ({
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
});

