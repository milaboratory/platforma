import { deepFreeze } from './obj';
import { gunzipSync, gzipSync } from 'node:zlib';
import canonicalize from 'canonicalize';

const deserializationCache = new WeakMap<Uint8Array, unknown>();
const decodingCache = new WeakMap<Uint8Array, string>();

const textDecoder = new TextDecoder();

let numberOfDeserializations = 0;
let numberOfCacheHits = 0;
let deserializedBytes = 0;
let cacheHitBytes = 0;

let numberOfDecodings = 0;
let numberOfDecodingCacheHits = 0;
let decodedBytes = 0;
let decodingCacheHitBytes = 0;

/**
 * Statistics related to the performance of the `cachedDecode` function.
 */
export type CachedDecodeStats = {
  /**
   * The total number of times `cachedDecode` was called and resulted in
   * a full decoding (i.e., a cache miss). This does not include cache hits.
   */
  numberOfDecodings: number;
  /** The total number of times `cachedDecode` was called and returned a cached result. */
  numberOfCacheHits: number;
  /** The total size in bytes of the data that was fully decoded (cache misses). */
  decodedBytes: number;
  /** The total size in bytes of the data for which a cached result was returned (cache hits). */
  cacheHitBytes: number;
};

export function getCachedDecodeStats(): CachedDecodeStats {
  return {
    numberOfDecodings,
    numberOfCacheHits: numberOfDecodingCacheHits,
    decodedBytes,
    cacheHitBytes: decodingCacheHitBytes,
  };
}

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

const CachedMinCachingSize = 64;

/**
 * Decodes a Uint8Array into a string.
 * The data can be gzipped, in which case it will be decompressed automatically.
 *
 * This function caches the decoded string using a WeakMap with the input
 * Uint8Array as the key. If the same Uint8Array instance is passed multiple
 * times, the cached result is returned directly.
 *
 * @param data The Uint8Array to decode.
 * @returns The decoded string.
 */
export function cachedDecode(data: Uint8Array): string {
  const fromCache = decodingCache.get(data);
  if (fromCache) {
    numberOfDecodingCacheHits++;
    decodingCacheHitBytes += data.byteLength;
    return fromCache;
  }

  // Check for gzip magic numbers: 0x1f 0x8b
  const isGzipped = data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;

  const dataToDecode = isGzipped ? gunzipSync(data) : data;
  const text = textDecoder.decode(dataToDecode);

  if (data.byteLength >= CachedMinCachingSize) {
    decodingCache.set(data, text);
  }
  numberOfDecodings++;
  decodedBytes += data.byteLength;
  return text;
}

/**
 * Deserializes a Uint8Array containing JSON text into a JavaScript object.
 * The data can be gzipped, in which case it will be decompressed automatically.
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
export function cachedDeserialize<T = unknown>(data: Uint8Array): T {
  const fromCache = deserializationCache.get(data);
  if (fromCache) {
    numberOfCacheHits++;
    cacheHitBytes += data.byteLength;
    return fromCache as T;
  }

  const text = cachedDecode(data);

  const result = JSON.parse(text);
  deepFreeze(result);
  if (data.byteLength >= CachedMinCachingSize)
    deserializationCache.set(data, result);
  numberOfDeserializations++;
  deserializedBytes += data.byteLength;
  return result;
}

/**
 * Serializes an object to a Uint8Array using canonical JSON format.
 *
 * The object is converted to a canonical JSON string using `canonicalize`,
 * and then encoded as a UTF-8 Uint8Array.
 *
 * @param data The object to serialize.
 * @returns A Uint8Array containing the canonical JSON.
 * @throws If the data cannot be converted to canonical JSON.
 */
export function canonicalJsonBytes(data: unknown): Uint8Array {
  const canonicalJson = canonicalize(data);
  if (canonicalJson === undefined)
    throw new Error(
      `The data cannot be converted to canonical JSON. ${data as any}`,
    );
  return Buffer.from(canonicalJson);
}

/**
 * Serializes an object to a gzipped Uint8Array using canonical JSON format.
 *
 * The object is first serialized to canonical JSON bytes. If the resulting
 * data is large enough (or if gzipping is forced), it is then compressed
 * using gzip.
 *
 * @param data The object to serialize.
 * @param minSizeToGzip The minimum size in bytes for the data to be gzipped.
 *   - `undefined`: Gzipping is disabled.
 *   - `-1`: Gzipping is always enabled, regardless of size.
 *   - A number (e.g., 16384): Data will be gzipped if its size is greater than or equal to this value.
 *   Defaults to 16,384 bytes.
 * @returns An object containing the serialized data (`Uint8Array`) and a boolean
 *   `isGzipped` indicating whether compression was applied.
 * @throws If the data cannot be converted to canonical JSON.
 */
export function canonicalJsonGzBytes(
  data: unknown,
  minSizeToGzip: number | undefined = 16_384,
): { data: Uint8Array; isGzipped: boolean } {
  const jsonData = canonicalJsonBytes(data);

  if (minSizeToGzip === undefined) {
    return { data: jsonData, isGzipped: false };
  }

  if (minSizeToGzip === -1 || jsonData.length >= minSizeToGzip) {
    return { data: gzipSync(jsonData), isGzipped: true };
  }

  return { data: jsonData, isGzipped: false };
}
