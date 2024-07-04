import { AccessorHandle, GlobalCfgRenderCtx, MainAccessorName, StagingAccessorName } from './internal';
import { getCfgRenderCtx, tryGetCfgRenderCtx } from '../internal';
import { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from './traversal_ops';

export class FutureRef<T = unknown> {
  constructor(private readonly handle: AccessorHandle) {
  }
}

export type ExtractFutureRefType<Ref extends FutureRef> =
  Ref extends FutureRef<infer T>
    ? T
    : never;

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

  public getKeyValue(key: string): Uint8Array | undefined {
    return wrapBuffer(getCfgRenderCtx().getKeyValue(this.handle, key));
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

  public getData(): Uint8Array | undefined {
    return wrapBuffer(getCfgRenderCtx().getData(this.handle));
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
}

export class RenderCtx<Args, UiState> {
  private readonly ctx: GlobalCfgRenderCtx;

  public readonly args: Args;
  public readonly uiState: UiState | undefined;

  constructor() {
    const ctx = getCfgRenderCtx();
    this.ctx = ctx;
    this.args = JSON.parse(ctx.args);
    this.uiState = ctx.uiState !== undefined ? JSON.parse(ctx.uiState) : undefined;
  }

  private getNamedAccessor(name: string): TreeNodeAccessor | undefined {
    const accessorId = this.ctx.getAccessorHandleByName(name);
    return accessorId ? new TreeNodeAccessor(accessorId) : undefined;
  }

  get stagingOutput(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(StagingAccessorName);
  }

  get mainOutput(): TreeNodeAccessor | undefined {
    return this.getNamedAccessor(MainAccessorName);
  }
}

export type RenderFunction<Args = unknown, UiState = unknown> =
  (rCtx: RenderCtx<Args, UiState>) => unknown

export type InferRenderFunctionReturn<RF extends Function> =
  RF extends () => infer R
    ? R extends FutureRef<infer T>
      ? T
      : R
    : never;
