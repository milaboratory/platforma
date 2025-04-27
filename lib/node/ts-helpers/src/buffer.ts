import { deepFreeze } from './obj';

const deserializationCache = new WeakMap<Uint8Array, unknown>();

const textDecoder = new TextDecoder();

let numberOfDeserializations = 0;
let numberOfCacheHits = 0;
let deserializedBytes = 0;
let cacheHitBytes = 0;

/**
 * Statistics related to the performance of the `cachedDeserialize` function.
 */
export type CachedDeserializeStats = {
  /**
   * The total number of times `cachedDeserialize` was called and resulted in
   * a full deserialization (i.e., a cache miss). This does not include cache hits.
   */
  numberOfDeserializations: number;
  /** The total number of times `cachedDeserialize` was called and returned a cached result. */
  numberOfCacheHits: number;
  /** The total size in bytes of the data that was fully deserialized (cache misses). */
  deserializedBytes: number;
  /** The total size in bytes of the data for which a cached result was returned (cache hits). */
  cacheHitBytes: number;
};

export function getCachedDeserializeStats(): CachedDeserializeStats {
  return {
    numberOfDeserializations,
    numberOfCacheHits,
    deserializedBytes,
    cacheHitBytes,
  };
}

const CachedDeserializeMinCachingSize = 64;

/**
 * Deserializes a Uint8Array containing JSON text into a JavaScript object.
 *
 * This function caches the deserialized object using a WeakMap with the input
 * Uint8Array as the key. If the same Uint8Array instance is passed multiple
 * times, the cached result is returned directly.
 *
 * The returned object is deeply frozen to ensure immutability.
 *
 * @param data The Uint8Array containing the JSON text to deserialize.
 * @returns The deserialized JavaScript object (deeply frozen).
 */
export function cachedDeserialize(data: Uint8Array): unknown {
  const fromCache = deserializationCache.get(data);
  if (fromCache) {
    numberOfCacheHits++;
    cacheHitBytes += data.byteLength;
    return fromCache;
  }
  const text = textDecoder.decode(data);

  const result = JSON.parse(text);
  deepFreeze(result);
  if (data.byteLength >= CachedDeserializeMinCachingSize)
    deserializationCache.set(data, result);
  numberOfDeserializations++;
  deserializedBytes += data.byteLength;
  return result;
}
