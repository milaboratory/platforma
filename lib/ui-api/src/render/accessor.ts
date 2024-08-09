import {
  AnyLogHandle,
  ImportProgress,
  LocalBlobHandleAndSize,
  PObject,
  RemoteBlobHandleAndSize,
  mapPObjectData
} from '@milaboratory/sdk-model';
import { getCfgRenderCtx } from '../internal';
import { FutureRef } from './future';
import { AccessorHandle } from './internal';
import { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from './traversal_ops';

function ifDef<T, R>(value: T | undefined, cb: (value: T) => R): R | undefined {
  return value === undefined ? undefined : cb(value);
}

function wrapBuffer(buf: ArrayBuffer | undefined): Uint8Array | undefined {
  return buf === undefined ? undefined : new Uint8Array(buf);
}

function wrapAccessor(handle: AccessorHandle | undefined): TreeNodeAccessor | undefined {
  return handle === undefined ? undefined : new TreeNodeAccessor(handle);
}

/** Represent resource tree node accessor */
export class TreeNodeAccessor {
  constructor(public readonly handle: AccessorHandle) {}

  public resolve(
    ...steps: [
      Omit<FieldTraversalStep, 'errorIfFieldNotSet'> & {
        errorIfFieldNotAssigned: true;
      }
    ]
  ): TreeNodeAccessor;
  public resolve(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined;
  public resolve(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined {
    return this.resolveWithCommon({}, ...steps);
  }

  public resolveWithCommon(
    commonOptions: CommonFieldTraverseOps,
    ...steps: (FieldTraversalStep | string)[]
  ): TreeNodeAccessor | undefined {
    return wrapAccessor(getCfgRenderCtx().resolveWithCommon(this.handle, commonOptions, ...steps));
  }

  public get resourceType(): ResourceType {
    return getCfgRenderCtx().getResourceType(this.handle);
  }

  public getInputsLocked(): boolean {
    return getCfgRenderCtx().getInputsLocked(this.handle);
  }

  public getOutputsLocked(): boolean {
    return getCfgRenderCtx().getOutputsLocked(this.handle);
  }

  public getIsReadyOrError(): boolean {
    return getCfgRenderCtx().getIsReadyOrError(this.handle);
  }

  public getIsFinal(): boolean {
    return getCfgRenderCtx().getIsFinal(this.handle);
  }

  public getError(): TreeNodeAccessor | undefined {
    return wrapAccessor(getCfgRenderCtx().getError(this.handle));
  }

  public listInputFields(): string[] {
    return getCfgRenderCtx().listInputFields(this.handle);
  }

  public listOutputFields(): string[] {
    return getCfgRenderCtx().listOutputFields(this.handle);
  }

  public listDynamicFields(): string[] {
    return getCfgRenderCtx().listDynamicFields(this.handle);
  }

  public getKeyValueBase64(key: string): string | undefined {
    return getCfgRenderCtx().getKeyValueBase64(this.handle, key);
  }

  public getKeyValueAsString(key: string): string | undefined {
    return getCfgRenderCtx().getKeyValueAsString(this.handle, key);
  }

  public getKeyValueAsJson<T>(key: string): T {
    const content = this.getKeyValueAsString(key);
    if (content == undefined) throw new Error('Resource has no content.');
    return JSON.parse(content);
  }

  public getDataBase64(): string | undefined {
    return getCfgRenderCtx().getDataBase64(this.handle);
  }

  public getDataAsString(): string | undefined {
    return getCfgRenderCtx().getDataAsString(this.handle);
  }

  public getDataAsJson<T>(): T {
    const content = this.getDataAsString();
    if (content == undefined) throw new Error('Resource has no content.');
    return JSON.parse(content);
  }

  public parsePObjectCollection(
    errorOnUnknownField: boolean = false,
    prefix: string = ''
  ): Record<string, PObject<TreeNodeAccessor>> | undefined {
    const pObjects = getCfgRenderCtx().parsePObjectCollection(
      this.handle,
      errorOnUnknownField,
      prefix
    );
    if (pObjects === undefined) return undefined;
    const result: Record<string, PObject<TreeNodeAccessor>> = {};
    for (const [key, value] of Object.entries(pObjects))
      result[key] = mapPObjectData(value, (c) => new TreeNodeAccessor(c));
    return result;
  }

  public getFileContentAsBase64(): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getBlobContentAsBase64(this.handle));
  }

  public getFileContentAsString(): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getBlobContentAsString(this.handle));
  }

  public getFileContentAsJson<T>(): FutureRef<T | undefined> {
    return new FutureRef<string | undefined>(
      getCfgRenderCtx().getBlobContentAsString(this.handle)
    ).mapDefined((v) => JSON.parse(v) as T);
  }

  /**
   * @deprecated use getFileContentAsBase64
   */
  public getBlobContentAsBase64(): FutureRef<string | undefined> {
    return this.getFileContentAsBase64();
  }

  /**
   * @deprecated use getFileContentAsString
   */
  public getBlobContentAsString(): FutureRef<string | undefined> {
    return this.getFileContentAsString();
  }

  public getDownloadedBlobHandle(): FutureRef<LocalBlobHandleAndSize | undefined> {
    return new FutureRef(getCfgRenderCtx().getDownloadedBlobContentHandle(this.handle));
  }

  public getOnDemandBlobHandle(): FutureRef<RemoteBlobHandleAndSize | undefined> {
    return new FutureRef(getCfgRenderCtx().getOnDemandBlobContentHandle(this.handle));
  }

  public getImportProgress(): FutureRef<ImportProgress> {
    return new FutureRef(getCfgRenderCtx().getImportProgress(this.handle));
  }

  public getLastLogs(nLines: number): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getLastLogs(this.handle, nLines));
  }

  public getProgressLog(patternToSearch: string): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getProgressLog(this.handle, patternToSearch));
  }

  public getLogHandle(): FutureRef<AnyLogHandle | undefined> {
    return new FutureRef(getCfgRenderCtx().getLogHandle(this.handle));
  }
}
