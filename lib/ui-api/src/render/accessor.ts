import { AccessorHandle } from './internal';
import { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from './traversal_ops';
import { getCfgRenderCtx } from '../internal';
import { FutureRef } from './future';
import { LocalBlobHandleAndSize, RemoteBlobHandleAndSize } from '@milaboratory/sdk-model';

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
  constructor(private readonly handle: AccessorHandle) {
  }

  public resolve(...steps: [Omit<FieldTraversalStep, 'errorIfFieldNotSet'> & {
    errorIfFieldNotAssigned: true
  }]): TreeNodeAccessor
  public resolve(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined
  public resolve(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined {
    return this.resolveWithCommon({}, ...steps);
  }

  public resolveWithCommon(commonOptions: CommonFieldTraverseOps, ...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined {
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
  };

  public getKeyValueAsJson<T>(key: string): T {
    const content = this.getKeyValueAsString(key);
    if (content == undefined)
      throw new Error('Resource has no content.');
    return JSON.parse(content);
  };

  public getDataBase64(): string | undefined {
    return getCfgRenderCtx().getDataBase64(this.handle);
  }

  public getDataAsString(): string | undefined {
    return getCfgRenderCtx().getDataAsString(this.handle);
  };

  public getDataAsJson<T>(): T {
    const content = this.getDataAsString();
    if (content == undefined)
      throw new Error('Resource has no content.');
    return JSON.parse(content);
  };

  public getBlobContentAsBase64(): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getBlobContentAsBase64(this.handle));
  }

  public getBlobContentAsString(): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getBlobContentAsString(this.handle));
  }

  public getDownloadedBlobHandle(): FutureRef<LocalBlobHandleAndSize | undefined> {
    return new FutureRef(getCfgRenderCtx().getDownloadedBlobContentHandle(this.handle));
  }

  public getOnDemandBlobHandle(): FutureRef<RemoteBlobHandleAndSize | undefined> {
    return new FutureRef(getCfgRenderCtx().getOnDemandBlobContentHandle(this.handle));
  }
}
