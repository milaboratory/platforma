import type { BlobHandleAndSize } from '@platforma-sdk/model';
import { getRawPlatformaInstance } from '@platforma-sdk/model';
import { LRUCache } from 'lru-cache';
import type { ComputedRef, ShallowRef } from 'vue';
import { computed, shallowRef } from 'vue';
import type { ZodSchema } from 'zod';

type FileHandle = BlobHandleAndSize['handle'];

export type ReactiveFileContentOps = {
  /** Maximum size in bytes of file content to cache */
  cacheSize: number;
};

const DefaultReactiveFileContentOps: ReactiveFileContentOps = {
  cacheSize: 15_000_000, // 15 Mb
};

class FileContentData {
  private _str: string | undefined = undefined;
  private _rawJson: unknown | undefined = undefined;
  private _zodSchema: ZodSchema | undefined = undefined;
  private _validatedJson: unknown | undefined = undefined;

  constructor(public readonly bytes: Uint8Array) {}

  public get str(): string {
    if (this._str === undefined) this._str = new TextDecoder().decode(this.bytes);
    return this._str;
  }

  public get rawJson(): unknown {
    if (this._rawJson === undefined) this._rawJson = JSON.parse(this.str);
    return this._rawJson;
  }

  public validatedJson<T>(schema: ZodSchema<T>): T {
    if (this._zodSchema !== schema) {
      this._validatedJson = schema.parse(this.rawJson);
      this._zodSchema = schema;
    }
    return this._validatedJson as T;
  }
}

export class ReactiveFileContent {
  private readonly fileDataCache: LRUCache<FileHandle, FileContentData>;
  private readonly fileDataRefs = new Map<FileHandle, ShallowRef<FileContentData | undefined>>();
  constructor(_ops?: Partial<ReactiveFileContentOps>) {
    const ops: ReactiveFileContentOps = { ...DefaultReactiveFileContentOps, ...(_ops ?? {}) };
    this.fileDataCache = new LRUCache<FileHandle, FileContentData>({
      maxSize: ops.cacheSize,
      fetchMethod: async (key) => new FileContentData(await getRawPlatformaInstance().blobDriver.getContent(key)),
      sizeCalculation: (value) => value.bytes.length,
      /** Will also be called on error fetching the file */
      dispose: (_, key) => {
        this.fileDataRefs.delete(key);
      },
    });
  }

  private getDataRef(handle: FileHandle): ShallowRef<FileContentData | undefined> {
    const refFromMap = this.fileDataRefs.get(handle);
    if (refFromMap !== undefined) return refFromMap;
    const newRef = shallowRef<FileContentData>();
    this.fileDataRefs.set(handle, newRef);

    // Initiating actual fetch from the cache, that will in turn initiate upload
    (async () => {
      try {
        const data = await this.fileDataCache.fetch(handle);
        newRef.value = data;
      } catch (err: unknown) {
        console.error(err);
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
    return computed(() => dataRef?.value?.str);
  }

  public getContentJson<T>(handle: FileHandle, schema: ZodSchema<T>): ComputedRef<T | undefined>;
  public getContentJson<T>(handle: FileHandle | undefined, schema: ZodSchema<T>): ComputedRef<T | undefined> | undefined;
  public getContentJson<T = unknown>(handle: FileHandle): ComputedRef<T | undefined>;
  public getContentJson<T = unknown>(handle: FileHandle | undefined): ComputedRef<T | undefined> | undefined;
  public getContentJson<T>(handle: FileHandle | undefined, schema?: ZodSchema<T>): ComputedRef<T | undefined> | undefined;
  public getContentJson<T>(handle: FileHandle | undefined, schema?: ZodSchema<T>): ComputedRef<T | undefined> | undefined {
    if (handle === undefined) return undefined;
    const dataRef = this.getDataRef(handle);
    return computed(() => (schema === undefined ? dataRef?.value?.rawJson : dataRef?.value?.validatedJson(schema)) as T);
  }

  private static globalInstance = new ReactiveFileContent();

  public static getContentBytes(handle: FileHandle): ComputedRef<Uint8Array | undefined>;
  public static getContentBytes(handle: FileHandle | undefined): ComputedRef<Uint8Array | undefined> | undefined;
  public static getContentBytes(handle: FileHandle | undefined): ComputedRef<Uint8Array | undefined> | undefined {
    return ReactiveFileContent.globalInstance.getContentBytes(handle);
  }

  public static getContentString(handle: FileHandle): ComputedRef<string | undefined>;
  public static getContentString(handle: FileHandle | undefined): ComputedRef<string | undefined> | undefined;
  public static getContentString(handle: FileHandle | undefined): ComputedRef<string | undefined> | undefined {
    return ReactiveFileContent.globalInstance.getContentString(handle);
  }

  public static getContentJson<T>(handle: FileHandle, schema: ZodSchema<T>): ComputedRef<T | undefined>;
  public static getContentJson<T>(handle: FileHandle | undefined, schema: ZodSchema<T>): ComputedRef<T | undefined> | undefined;
  public static getContentJson<T = unknown>(handle: FileHandle): ComputedRef<T | undefined>;
  public static getContentJson<T = unknown>(handle: FileHandle | undefined): ComputedRef<T | undefined> | undefined;
  public static getContentJson<T>(handle: FileHandle | undefined, schema?: ZodSchema<T>): ComputedRef<T | undefined> | undefined {
    return ReactiveFileContent.globalInstance.getContentJson(handle, schema);
  }
}
