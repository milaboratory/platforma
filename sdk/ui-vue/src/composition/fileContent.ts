import type { BlobHandleAndSize } from '@platforma-sdk/model';
import { getRawPlatformaInstance } from '@platforma-sdk/model';
import { LRUCache } from 'lru-cache';
import type { ComputedRef, ShallowRef, EffectScope } from 'vue';
import { computed, shallowRef, getCurrentScope, onScopeDispose, effectScope } from 'vue';
import type { ZodSchema, SafeParseReturnType } from 'zod';
import { Fetcher } from '@milaboratories/helpers';

type FileHandle = BlobHandleAndSize['handle'];

export type ReactiveFileContentOps = {
  /** Maximum size in bytes of file content to cache */
  cacheSize: number;
  lruCache?: LRUCache<FileHandle, FileContentData>;
  fetcher?: Fetcher<FileHandle, FileContentData>;
};

const DefaultReactiveFileContentOps: ReactiveFileContentOps = {
  cacheSize: 15_000_000, // 15 Mb
};

class FileContentData {
  private _str: string | undefined = undefined;
  private _rawJson: unknown | undefined = undefined;
  private _zodSchema: ZodSchema | undefined = undefined;
  private _validatedJson: SafeParseReturnType<unknown, unknown> | undefined = undefined;

  constructor(public readonly bytes: Uint8Array) {}

  public get str(): string {
    if (this._str === undefined) this._str = new TextDecoder().decode(this.bytes);
    return this._str;
  }

  public get rawJson(): unknown {
    if (this._rawJson === undefined) this._rawJson = JSON.parse(this.str);
    return this._rawJson;
  }

  public validatedJson<T>(schema: ZodSchema<T>): T | undefined {
    if (this._zodSchema !== schema) {
      this._validatedJson = schema.safeParse(this.rawJson);
      this._zodSchema = schema;
    }
    return this._validatedJson?.success ? (this._validatedJson.data as T) : undefined;
  }
}

const scopes = new WeakMap<EffectScope, Map<FileHandle, ShallowRef<FileContentData | undefined>>>();

function addScope(scope: EffectScope) {
  scopes.set(scope, new Map<FileHandle, ShallowRef<FileContentData | undefined>>());
}

const globalCache = new LRUCache<FileHandle, FileContentData>({
  maxSize: DefaultReactiveFileContentOps.cacheSize,
  sizeCalculation: (value) => value.bytes.length,
});

const globalFetcher = new Fetcher<FileHandle, FileContentData>();

export class ReactiveFileContent {
  private readonly fileDataCache: LRUCache<FileHandle, FileContentData>;
  private readonly fetcher: Fetcher<FileHandle, FileContentData>;
  private ns = new Map<string, Set<FileHandle>>();
  private currentKey: string | undefined;

  private constructor(private currentScope: EffectScope, _ops?: Partial<ReactiveFileContentOps>) {
    const ops: ReactiveFileContentOps = { ...DefaultReactiveFileContentOps, ...(_ops ?? {}) };
    this.fileDataCache = ops.lruCache ?? new LRUCache<FileHandle, FileContentData>({
      maxSize: ops.cacheSize,
      sizeCalculation: (value) => value.bytes.length,
    });
    this.fetcher = ops.fetcher ?? new Fetcher<FileHandle, FileContentData>();
  }

  /**
   * Experimental method to invalidate the refs map cache for a given key.
   */
  public withInvalidate<T>(key: string, cb: () => T) {
    const previous = this.ns.get(key);
    this.ns.set(key, new Set());
    this.currentKey = key;
    try {
      const res = cb();
      this.invalidate(key, previous);
      return res;
    } finally {
      this.currentKey = undefined;
    }
  }

  public stopScope() {
    this.currentScope.stop();
  }

  private async doFetch(handle: FileHandle) {
    if (!this.fileDataCache.has(handle)) {
      const fileContentData = await this.fetcher.fetch(handle, async () => new FileContentData(await getRawPlatformaInstance().blobDriver.getContent(handle)));
      this.fileDataCache.set(handle, fileContentData);
    }

    return this.fileDataCache.get(handle)!;
  }

  private getSize() {
    const refsMap = this.getRefsMap();
    return refsMap ? refsMap.size : 0;
  }

  private getRefsMap() {
    return scopes.get(this.currentScope);
  }

  private invalidate(key: string, previous: Set<FileHandle> | undefined) {
    if (!previous) {
      return;
    }

    const actual = this.ns.get(key)!;

    for (const handle of actual) {
      previous.delete(handle);
    }

    const map = this.getRefsMap();

    for (const handle of previous) {
      map?.delete(handle);
    }
  }

  private withHandle(handle: FileHandle) {
    if (this.currentKey) {
      this.ns.get(this.currentKey)?.add(handle);
    }
  }

  private getDataRef(handle: FileHandle): ShallowRef<FileContentData | undefined> {
    const refsMap = this.getRefsMap();

    if (!refsMap) {
      throw new Error('ReactiveFileContent must be used within a Vue component or effect scope. Call useGlobalInstance() first.');
    }

    this.withHandle(handle);

    const refFromMap = refsMap.get(handle);

    if (refFromMap !== undefined) {
      return refFromMap;
    }

    const newRef = shallowRef<FileContentData>();
    refsMap.set(handle, newRef);

    // Initiating actual fetch from the cache, that will in turn initiate upload
    (async () => {
      const maxRetries = 8;
      const retryDelay = 1000; // 1 second

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const data = await this.doFetch(handle);
          newRef.value = data;
          return;
        } catch (err: unknown) {
          console.error(`File download attempt ${attempt + 1}/${maxRetries} failed:`, err);

          if (attempt < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          } else {
            console.error(`Failed to download file after ${maxRetries} attempts`);
          }
        }
      }
    })();

    return newRef;
  }

  public getContentBytes(handle: FileHandle): ComputedRef<Uint8Array | undefined>;
  public getContentBytes(handle: FileHandle | undefined): ComputedRef<Uint8Array | undefined> | undefined;
  public getContentBytes(handle: FileHandle | undefined): ComputedRef<Uint8Array | undefined> | undefined {
    if (handle === undefined) return undefined;
    const dataRef = this.getDataRef(handle);
    return computed(() => dataRef.value?.bytes);
  }

  public getContentString(handle: FileHandle): ComputedRef<string | undefined>;
  public getContentString(handle: FileHandle | undefined): ComputedRef<string | undefined> | undefined;
  public getContentString(handle: FileHandle | undefined): ComputedRef<string | undefined> | undefined {
    if (handle === undefined) return undefined;
    const dataRef = this.getDataRef(handle);
    return computed(() => dataRef.value?.str);
  }

  public getContentJson<T>(handle: FileHandle, schema: ZodSchema<T>): ComputedRef<T | undefined>;
  public getContentJson<T>(handle: FileHandle | undefined, schema: ZodSchema<T>): ComputedRef<T | undefined> | undefined;
  public getContentJson<T = unknown>(handle: FileHandle): ComputedRef<T | undefined>;
  public getContentJson<T = unknown>(handle: FileHandle | undefined): ComputedRef<T | undefined> | undefined;
  public getContentJson<T>(handle: FileHandle | undefined, schema?: ZodSchema<T>): ComputedRef<T | undefined> | undefined;
  public getContentJson<T>(handle: FileHandle | undefined, schema?: ZodSchema<T>): ComputedRef<T | undefined> | undefined {
    if (handle === undefined) return undefined;
    const dataRef = this.getDataRef(handle);
    return computed(() => (schema === undefined ? dataRef.value?.rawJson : dataRef.value?.validatedJson(schema)) as T);
  }

  private static initScope(_scope: EffectScope | undefined) {
    let scope = getCurrentScope() ?? _scope;

    if (!scope) {
      console.warn('Current scope not found, using new detached scope...');
      scope = effectScope(true);
    }

    addScope(scope);

    onScopeDispose(() => {
      scopes.delete(scope);
    });

    return scope;
  }

  /**
   * Creates a ReactiveFileContent instance with isolated cache and fetcher.
   * Use this when you need component-specific caching.
   *
   * @example
   * ```ts
   * import { ReactiveFileContent } from '@platforma-sdk/ui-vue';
   * import { computed } from 'vue';
   *
   * const fileContent = ReactiveFileContent.use();
   *
   * const processedData = computed(() => {
   *   const content = fileContent.getContentString(fileHandle).value;
   *   return content?.split('\n').length ?? 0;
   * });
   * ```
   */
  public static use(_ops?: Partial<ReactiveFileContentOps>, _scope?: EffectScope) {
    const scope = this.initScope(_scope);

    return new ReactiveFileContent(scope, { ..._ops });
  }

  /**
   * Creates a ReactiveFileContent instance with globally shared cache and fetcher.
   * Use this to share file content cache across multiple components.
   *
   * @example
   * ```ts
   * import { ReactiveFileContent } from '@platforma-sdk/ui-vue';
   * import { computed } from 'vue';
   *
   * const fileContent = ReactiveFileContent.useGlobal();
   *
   * const combinedData = computed(() => {
   *   const data1 = fileContent.getContentJson(handle1).value;
   *   const data2 = fileContent.getContentJson(handle2).value;
   *   return { data1, data2 };
   * });
   * ```
   */
  public static useGlobal(_ops?: Partial<ReactiveFileContentOps>, _scope?: EffectScope) {
    const scope = this.initScope(_scope);

    return new ReactiveFileContent(scope, { ..._ops, lruCache: globalCache, fetcher: globalFetcher });
  }
}
