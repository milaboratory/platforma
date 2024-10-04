import { BlobHandleAndSize, getRawPlatformaInstance } from '@platforma-sdk/model';
import { shallowRef, ShallowRef, watch } from 'vue';
import { ZodSchema } from 'zod';

type FileHandle = BlobHandleAndSize['handle'];

export class ReactiveFileContent {
  private readonly fileContentBytes = new Map<FileHandle, ShallowRef<Uint8Array | undefined>>();

  public getContentBytes(handle: FileHandle): ShallowRef<Uint8Array | undefined>;
  public getContentBytes(
    handle: FileHandle | undefined
  ): ShallowRef<Uint8Array | undefined> | undefined;
  public getContentBytes(
    handle: FileHandle | undefined
  ): ShallowRef<Uint8Array | undefined> | undefined {
    if (handle === undefined) return undefined;
    const refFromMap = this.fileContentBytes.get(handle);
    if (refFromMap !== undefined) return refFromMap;
    const newRef = shallowRef<Uint8Array>();
    this.fileContentBytes.set(handle, newRef);

    // Initiating actual upload
    (async () => {
      try {
        const content = await getRawPlatformaInstance().blobDriver.getContent(handle);
        newRef.value = JSON.parse(new TextDecoder().decode(content));
      } catch (err: unknown) {
        console.error(err);
      }
    })();

    return newRef;
  }

  private readonly fileContentJson = new Map<FileHandle, ShallowRef<unknown | undefined>>();

  public getContentJson<T>(handle: FileHandle, schema: ZodSchema<T>): ShallowRef<T | undefined>;
  public getContentJson<T>(
    handle: FileHandle | undefined,
    schema: ZodSchema<T>
  ): ShallowRef<T | undefined> | undefined;
  public getContentJson<T = unknown>(handle: FileHandle): ShallowRef<T | undefined>;
  public getContentJson<T = unknown>(
    handle: FileHandle | undefined
  ): ShallowRef<T | undefined> | undefined;
  public getContentJson<T>(
    handle: FileHandle | undefined,
    schema?: ZodSchema<T>
  ): ShallowRef<T | undefined> | undefined {
    if (handle === undefined) return undefined;

    const refFromMap = this.fileContentJson.get(handle);
    if (refFromMap !== undefined) return refFromMap as ShallowRef<T | undefined>;

    const newRef = shallowRef<T | undefined>();
    this.fileContentJson.set(handle, newRef);

    const bytes = this.getContentBytes(handle);
    watch(
      bytes,
      (b) => {
        if (b === undefined) return;
        try {
          let data = JSON.parse(new TextDecoder().decode(b)) as T;
          if (schema) data = schema.parse(data);
          newRef.value = data;
        } catch (e: unknown) {
          console.error(e);
        }
      },
      { immediate: true }
    );

    return newRef;
  }
}
