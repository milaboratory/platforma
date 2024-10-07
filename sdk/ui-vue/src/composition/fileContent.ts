import type { BlobHandleAndSize } from '@platforma-sdk/model';
import { getRawPlatformaInstance } from '@platforma-sdk/model';
import type { ComputedRef, ShallowRef } from 'vue';
import { computed, shallowRef } from 'vue';
import type { ZodSchema } from 'zod';

type FileHandle = BlobHandleAndSize['handle'];

export class ReactiveFileContent {
  private readonly fileContentBytes = new Map<FileHandle, ShallowRef<Uint8Array | undefined>>();

  public getContentBytes(handle: FileHandle): ShallowRef<Uint8Array | undefined>;
  public getContentBytes(handle: FileHandle | undefined): ShallowRef<Uint8Array | undefined> | undefined;
  public getContentBytes(handle: FileHandle | undefined): ShallowRef<Uint8Array | undefined> | undefined {
    if (handle === undefined) return undefined;
    const refFromMap = this.fileContentBytes.get(handle);
    if (refFromMap !== undefined) return refFromMap;
    const newRef = shallowRef<Uint8Array>();
    this.fileContentBytes.set(handle, newRef);

    // Initiating actual upload
    (async () => {
      try {
        const content = await getRawPlatformaInstance().blobDriver.getContent(handle);
        newRef.value = content;
      } catch (err: unknown) {
        console.error(err);
      }
    })();

    return newRef;
  }

  public getContentString(handle: FileHandle): ComputedRef<string | undefined>;
  public getContentString(handle: FileHandle | undefined): ComputedRef<string | undefined> | undefined;
  public getContentString(handle: FileHandle | undefined): ComputedRef<string | undefined> | undefined {
    if (handle === undefined) return undefined;
    const bytes = this.getContentBytes(handle);
    return computed(() => {
      if (bytes.value === undefined) return;
      try {
        return new TextDecoder().decode(bytes.value);
      } catch (e: unknown) {
        console.error(e);
        return undefined;
      }
    });
  }

  public getContentJson<T>(handle: FileHandle, schema: ZodSchema<T>): ComputedRef<T | undefined>;
  public getContentJson<T>(handle: FileHandle | undefined, schema: ZodSchema<T>): ComputedRef<T | undefined> | undefined;
  public getContentJson<T = unknown>(handle: FileHandle): ComputedRef<T | undefined>;
  public getContentJson<T = unknown>(handle: FileHandle | undefined): ComputedRef<T | undefined> | undefined;
  public getContentJson<T>(handle: FileHandle | undefined, schema?: ZodSchema<T>): ComputedRef<T | undefined> | undefined;
  public getContentJson<T>(handle: FileHandle | undefined, schema?: ZodSchema<T>): ComputedRef<T | undefined> | undefined {
    if (handle === undefined) return undefined;
    const stringValue = this.getContentString(handle);
    return computed(() => {
      if (stringValue.value === undefined) return;
      try {
        let data = JSON.parse(stringValue.value) as T;
        if (schema) data = schema.parse(data);
        return data;
      } catch (e: unknown) {
        console.error(e);
        return undefined;
      }
    });
  }

  private static globalInstance = new ReactiveFileContent();

  public static getContentBytes(handle: FileHandle): ShallowRef<Uint8Array | undefined>;
  public static getContentBytes(handle: FileHandle | undefined): ShallowRef<Uint8Array | undefined> | undefined;
  public static getContentBytes(handle: FileHandle | undefined): ShallowRef<Uint8Array | undefined> | undefined {
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
