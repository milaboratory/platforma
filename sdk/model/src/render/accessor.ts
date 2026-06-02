import type {
  AnyLogHandle,
  ImportProgress,
  LocalBlobHandleAndSize,
  PColumn,
  PObject,
  RemoteBlobHandleAndSize,
  FolderURL,
  ArchiveFormat,
  ProgressLogWithInfo,
  RangeBytes,
} from "@milaboratories/pl-model-common";
import { isPColumn, mapPObjectData } from "@milaboratories/pl-model-common";
import { getCfgRenderCtx } from "../internal";
import { FutureRef } from "./future";
import type { AccessorHandle } from "./internal";
import type { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from "./traversal_ops";

export function ifDef<T, R>(value: T | undefined, cb: (value: T) => R): R | undefined {
  return value === undefined ? undefined : cb(value);
}

/**
 * Decode an error node's content into a display message. The backend serializes
 * a resource error as `{"message": "..."}` (`ResourceError`); unwrap that to the
 * human-readable message. Falls back to the raw string when the content is not
 * that envelope (e.g. plain text, or an unexpected shape).
 */
function decodeErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // Not JSON — surface the raw content.
  }
  return raw;
}

type FieldMapOps = {
  /**
   * Type of fields to iterate over.
   * (default 'Input')
   * */
  readonly fieldType?: "Input" | "Output" | "Dynamic";
  /**
   * If not locked, `undefined` value will be returned. Do nothing if mapping `Dynamic` fields.
   * (default true)
   * */
  readonly requireLocked?: boolean;
  /**
   * Will skip unresolved fields.
   * (default false)
   * */
  readonly skipUnresolved?: boolean;
};

/** Represent resource tree node accessor */
export class TreeNodeAccessor {
  constructor(
    public readonly handle: AccessorHandle,
    public readonly resolvePath: string[],
  ) {}

  /** Shortcut for {@link resolveInput} */
  public resolve(
    ...steps: [
      Omit<FieldTraversalStep, "errorIfFieldNotSet"> & {
        errorIfFieldNotAssigned: true;
      },
    ]
  ): TreeNodeAccessor;
  /** Shortcut for {@link resolveInput} */
  public resolve(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined;
  public resolve(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined {
    const transformedSteps = steps.map(
      (s) =>
        ({
          assertFieldType: "Input",
          ...(typeof s === "string" ? { field: s } : s),
        }) satisfies FieldTraversalStep,
    );
    return this.resolveWithCommon({}, ...transformedSteps);
  }

  /** If field type assertion is not specified for the step, default is Output. */
  public resolveOutput(
    ...steps: [
      Omit<FieldTraversalStep, "errorIfFieldNotSet"> & {
        errorIfFieldNotAssigned: true;
      },
    ]
  ): TreeNodeAccessor;
  /** If field type assertion is not specified for the step, default is Output. */
  public resolveOutput(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined;
  public resolveOutput(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined {
    const transformedSteps = steps.map(
      (s) =>
        ({
          assertFieldType: "Output",
          ...(typeof s === "string" ? { field: s } : s),
        }) satisfies FieldTraversalStep,
    );
    return this.resolveWithCommon({}, ...transformedSteps);
  }

  /** If field type assertion is not specified for the step, default is Input. */
  public resolveInput(
    ...steps: [
      Omit<FieldTraversalStep, "errorIfFieldNotSet"> & {
        errorIfFieldNotAssigned: true;
      },
    ]
  ): TreeNodeAccessor;
  /** If field type assertion is not specified for the step, default is Input. */
  public resolveInput(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined;
  public resolveInput(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined {
    const transformedSteps = steps.map(
      (s) =>
        ({
          assertFieldType: "Input",
          ...(typeof s === "string" ? { field: s } : s),
        }) satisfies FieldTraversalStep,
    );
    return this.resolveWithCommon({}, ...transformedSteps);
  }

  public resolveAny(
    ...steps: [
      Omit<FieldTraversalStep, "errorIfFieldNotSet"> & {
        errorIfFieldNotAssigned: true;
      },
    ]
  ): TreeNodeAccessor;
  public resolveAny(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined;
  public resolveAny(...steps: (FieldTraversalStep | string)[]): TreeNodeAccessor | undefined {
    return this.resolveWithCommon({}, ...steps);
  }

  public resolveWithCommon(
    commonOptions: CommonFieldTraverseOps,
    ...steps: (FieldTraversalStep | string)[]
  ): TreeNodeAccessor | undefined {
    const resolvePath = [
      ...this.resolvePath,
      ...steps.map((step) => (typeof step === "string" ? step : step.field)),
    ];
    return ifDef(
      getCfgRenderCtx().resolveWithCommon(this.handle, commonOptions, ...steps),
      (accessor) => new TreeNodeAccessor(accessor, resolvePath),
    );
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
    const resolvePath = [...this.resolvePath, "error"];
    return ifDef(
      getCfgRenderCtx().getError(this.handle),
      (accsessor) => new TreeNodeAccessor(accsessor, resolvePath),
    );
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
    if (content == undefined) throw new Error("Resource has no content.");
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
    if (content == undefined) throw new Error("Resource has no content.");
    return JSON.parse(content);
  }

  /**
   * Like {@link getDataAsJson}, but does not throw while the resource is still
   * computing. Three states:
   *
   * - **Not ready** → returns `undefined` (loading).
   * - **Errored** → throws the resource's error.
   * - **Ready** → returns the parsed content.
   *
   * Prefer this over {@link getDataAsJson} in reactive output lambdas: a field
   * that resolves before its resource is ready (routine on remote backends)
   * makes {@link getDataAsJson} throw "Resource has no content." mid-calculation,
   * flashing a transient "Some outputs have errors" banner that clears when the
   * resource finishes (MILAB-6318).
   */
  public getDataAsJsonOrUndefined<T>(): T | undefined {
    // Not ready → undefined (loading). getIsReadyOrError() registers the
    // readiness dependency, so the lambda re-runs once the resource finishes.
    if (!this.getIsReadyOrError()) return undefined;
    // Errored → throw the actual error, decoded from the error node and tagged
    // with the resolve path for debugging context. Beats getDataAsJson's
    // generic "Resource has no content."
    const error = this.getError();
    if (error !== undefined) {
      const raw = error.getDataAsString();
      const message = raw === undefined ? "Resource computation failed." : decodeErrorMessage(raw);
      const path = this.resolvePath.join(".");
      throw new Error(path ? `${message} (at ${path})` : message);
    }
    // Ready → parse the content.
    return this.getDataAsJson<T>();
  }

  /**
   *
   */
  public getPColumns(
    errorOnUnknownField: boolean = false,
    prefix: string = "",
  ): PColumn<TreeNodeAccessor>[] | undefined {
    const result = this.parsePObjectCollection(errorOnUnknownField, prefix);
    if (result === undefined) return undefined;

    const pf = Object.entries(result).map(([, obj]) => {
      if (!isPColumn(obj)) throw new Error(`not a PColumn (kind = ${obj.spec.kind})`);
      return obj;
    });

    return pf;
  }

  /**
   *
   */
  public parsePObjectCollection(
    errorOnUnknownField: boolean = false,
    prefix: string = "",
  ): Record<string, PObject<TreeNodeAccessor>> | undefined {
    const pObjects = getCfgRenderCtx().parsePObjectCollection(
      this.handle,
      errorOnUnknownField,
      prefix,
      ...this.resolvePath,
    );
    if (pObjects === undefined) return undefined;
    const result: Record<string, PObject<TreeNodeAccessor>> = {};
    for (const [key, value] of Object.entries(pObjects)) {
      const resolvePath = [...this.resolvePath, key];
      result[key] = mapPObjectData(value, (c) => new TreeNodeAccessor(c, resolvePath));
    }
    return result;
  }

  public getFileContentAsBase64(range?: RangeBytes): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getBlobContentAsBase64(this.handle, range));
  }

  public getFileContentAsString(range?: RangeBytes): FutureRef<string | undefined> {
    return new FutureRef(getCfgRenderCtx().getBlobContentAsString(this.handle, range));
  }

  public getFileContentAsJson<T>(range?: RangeBytes): FutureRef<T | undefined> {
    return new FutureRef<string | undefined>(
      getCfgRenderCtx().getBlobContentAsString(this.handle, range),
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

  /**
   * @returns downloaded file handle
   */
  public getFileHandle(): FutureRef<LocalBlobHandleAndSize | undefined> {
    return new FutureRef(getCfgRenderCtx().getDownloadedBlobContentHandle(this.handle));
  }

  /**
   * @deprecated use getFileHandle
   */
  public getDownloadedBlobHandle(): FutureRef<LocalBlobHandleAndSize | undefined> {
    return this.getFileHandle();
  }

  /**
   * @returns downloaded file handle
   */
  public getRemoteFileHandle(): FutureRef<RemoteBlobHandleAndSize | undefined> {
    return new FutureRef(getCfgRenderCtx().getOnDemandBlobContentHandle(this.handle));
  }

  /**
   * @deprecated use getRemoteFileHandle
   */
  public getOnDemandBlobHandle(): FutureRef<RemoteBlobHandleAndSize | undefined> {
    return this.getRemoteFileHandle();
  }

  /**
   * @returns the url to the extracted folder
   */
  public extractArchiveAndGetURL(format: ArchiveFormat): FutureRef<FolderURL | undefined> {
    return new FutureRef(getCfgRenderCtx().extractArchiveAndGetURL(this.handle, format));
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

  public getProgressLogWithInfo(
    patternToSearch: string,
  ): FutureRef<ProgressLogWithInfo | undefined> {
    return new FutureRef(getCfgRenderCtx().getProgressLogWithInfo(this.handle, patternToSearch));
  }

  public getLogHandle(): FutureRef<AnyLogHandle | undefined> {
    return new FutureRef(getCfgRenderCtx().getLogHandle(this.handle));
  }

  public allFieldsResolved(fieldType: "Input" | "Output" = "Input"): boolean {
    switch (fieldType) {
      case "Input":
        return (
          this.getInputsLocked() &&
          this.listInputFields().every(
            (field) => this.resolve({ field, assertFieldType: "Input" }) !== undefined,
          )
        );
      case "Output":
        return (
          this.getOutputsLocked() &&
          this.listOutputFields().every(
            (field) => this.resolve({ field, assertFieldType: "Output" }) !== undefined,
          )
        );
    }
  }

  public mapFields<T>(
    _mapping: (name: string, value: TreeNodeAccessor) => T,
    _ops: FieldMapOps & { skipUnresolved: true },
  ): T[] | undefined;
  public mapFields<T>(
    _mapping: (name: string, value: TreeNodeAccessor | undefined) => T,
    _ops?: FieldMapOps,
  ): T[] | undefined;
  public mapFields<T>(
    _mapping: (name: string, value: TreeNodeAccessor) => T,
    _ops?: FieldMapOps,
  ): T[] | undefined {
    const { fieldType, requireLocked, skipUnresolved } = {
      fieldType: "Input" as const,
      requireLocked: true,
      skipUnresolved: false,
      ..._ops,
    };
    const mapping = _mapping as (name: string, value: TreeNodeAccessor | undefined) => T;
    if (requireLocked) {
      if (fieldType === "Input" && !this.getInputsLocked()) return undefined;
      if (fieldType === "Output" && !this.getOutputsLocked()) return undefined;
    }
    const fieldList =
      fieldType === "Input"
        ? this.listInputFields()
        : fieldType === "Output"
          ? this.listOutputFields()
          : this.listDynamicFields();
    let fieldEntries = fieldList.map(
      (field) => [field, this.resolve({ field, assertFieldType: fieldType })] as const,
    );
    if (skipUnresolved) fieldEntries = fieldEntries.filter((e) => e[1] !== undefined);
    return fieldEntries.map(([name, value]) => mapping(name, value));
  }
}
