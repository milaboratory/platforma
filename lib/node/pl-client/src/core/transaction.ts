// TODO: fix this
/* eslint-disable no-prototype-builtins */
import type {
  AnyResourceId,
  LocalResourceId,
  OptionalResourceId,
  BasicResourceData,
  FieldData,
  FieldType,
  ResourceData,
  ResourceId,
  ResourceType,
  FutureFieldType,
} from "./types";
import {
  createLocalResourceId,
  ensureResourceIdNotNull,
  MaxTxId,
  isLocalResourceId,
  extractBasicResourceData,
  isNullResourceId,
} from "./types";
import type {
  ClientMessageRequest,
  LLPlTransaction,
  OneOfKind,
  ServerMessageResponse,
} from "./ll_transaction";
import { TxAPI_Open_Request_WritableTx } from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import type { NonUndefined } from "utility-types";
import { toBytes } from "../util/util";
import { fieldTypeToProto, protoToField, protoToResource } from "./type_conversion";
import {
  canonicalJsonBytes,
  canonicalJsonGzBytes,
  deepFreeze,
  notEmpty,
} from "@milaboratories/ts-helpers";
import { isNotFoundError } from "./errors";
import type { FinalResourceDataPredicate } from "./final";
import type { LRUCache } from "lru-cache";
import type { ResourceDataCacheRecord } from "./cache";
import type { TxStat } from "./stat";
import { initialTxStatWithoutTime } from "./stat";
import type { ErrorResourceData } from "./error_resource";
import { ErrorResourceType } from "./error_resource";
import { JsonGzObject, JsonObject } from "../helpers/pl";
import { PromiseTracker } from "./PromiseTracker";

/** Reference to resource, used only within transaction */
export interface ResourceRef {
  /** Global resource id of newly created resources, become available only
   * after response for the corresponding creation request is received. */
  readonly globalId: Promise<ResourceId>;

  /** Transaction-local resource id is assigned right after resource creation
   * request is sent, and can be used right away */
  readonly localId: LocalResourceId;
}

/** Key-Value pair from resource-attached KV storage */
export interface KeyValue {
  key: string;
  value: Uint8Array;
}

/** Key-Value pair from resource-attached KV storage */
export interface KeyValueString {
  key: string;
  value: string;
}

interface _FieldId<RId> {
  /** Parent resource id */
  resourceId: RId;
  /** Field name */
  fieldName: string;
}

export type FieldId = _FieldId<ResourceId>;
export type FieldRef = _FieldId<ResourceRef>;
export type LocalFieldId = _FieldId<LocalResourceId>;
export type AnyFieldId = FieldId | LocalFieldId;

export type AnyResourceRef = ResourceRef | ResourceId;
export type AnyFieldRef = _FieldId<AnyResourceRef>; // FieldRef | FieldId
export type AnyRef = AnyResourceRef | AnyFieldRef;

export function isField(ref: AnyRef): ref is AnyFieldRef {
  return ref.hasOwnProperty("resourceId") && ref.hasOwnProperty("fieldName");
}

export function isResource(ref: AnyRef): ref is AnyResourceRef {
  return (
    typeof ref === "bigint" || (ref.hasOwnProperty("globalId") && ref.hasOwnProperty("localId"))
  );
}

export function isResourceId(ref: AnyRef): ref is ResourceId {
  return typeof ref === "bigint" && !isLocalResourceId(ref) && !isNullResourceId(ref);
}

export function isFieldRef(ref: AnyFieldRef): ref is FieldRef {
  return isResourceRef(ref.resourceId);
}

export function isResourceRef(ref: AnyResourceRef): ref is ResourceRef {
  return ref.hasOwnProperty("globalId") && ref.hasOwnProperty("localId");
}

export function toFieldId(ref: AnyFieldRef): AnyFieldId {
  if (isFieldRef(ref)) return { resourceId: ref.resourceId.localId, fieldName: ref.fieldName };
  else return ref as FieldId;
}

export async function toGlobalFieldId(ref: AnyFieldRef): Promise<FieldId> {
  if (isFieldRef(ref))
    return { resourceId: await ref.resourceId.globalId, fieldName: ref.fieldName };
  else return ref as FieldId;
}

export function toResourceId(ref: AnyResourceRef): AnyResourceId {
  if (isResourceRef(ref)) return ref.localId;
  else return ref;
}

export async function toGlobalResourceId(ref: AnyResourceRef): Promise<ResourceId> {
  if (isResourceRef(ref)) return await ref.globalId;
  else return ref;
}

export function field(resourceId: AnyResourceRef, fieldName: string): AnyFieldRef {
  return { resourceId, fieldName };
}

/** If transaction commit failed due to write conflicts */
export class TxCommitConflict extends Error {
  name = "TxCommitConflict";
}

async function notFoundToUndefined<T>(cb: () => Promise<T>): Promise<T | undefined> {
  try {
    return await cb();
  } catch (e) {
    if (isNotFoundError(e)) return undefined;
    throw e;
  }
}

/**
 * Decorator that wraps the method's returned promise with this.track()
 * This ensures that the promise will be awaited before the transaction is completed.
 */
function tracked<T extends (this: PlTransaction, ...a: any[]) => Promise<any>>(
  value: T,
  _context: ClassMethodDecoratorContext,
) {
  return function (this: PlTransaction, ...args: Parameters<T>): ReturnType<T> {
    return this.track(value.apply(this, args)) as ReturnType<T>;
  } as unknown as T;
}

/**
 * Each platform transaction has 3 stages:
 *   - initialization (txOpen message -> txInfo response)
 *   - communication (create resources, fields, references and so on)
 *   - finalization (txCommit or txDiscard message)
 *
 * This class encapsulates finalization stage and provides ready-to-communication transaction object.
 * */
export class PlTransaction {
  private readonly globalTxId: Promise<bigint>;
  private readonly localTxId: number = PlTransaction.nextLocalTxId();

  /** Used in caching */
  private readonly txOpenTimestamp = Date.now();

  private localResourceIdCounter = 0;

  /** Store logical tx open / closed state to prevent invalid sequence of requests.
   * True means output stream was completed.
   * Contract: there must be no async operations between setting this field to true and sending complete signal to stream. */
  private _completed = false;

  private globalTxIdWasAwaited: boolean = false;

  public readonly pending = new PromiseTracker();

  private readonly _startTime = Date.now();
  private readonly _stat = initialTxStatWithoutTime();
  public get stat(): TxStat {
    return {
      ...this._stat,
      timeMs: Date.now() - this._startTime,
    };
  }

  constructor(
    private readonly ll: LLPlTransaction,
    public readonly name: string,
    public readonly writable: boolean,
    private readonly _clientRoot: OptionalResourceId,
    private readonly finalPredicate: FinalResourceDataPredicate,
    private readonly sharedResourceDataCache: LRUCache<ResourceId, ResourceDataCacheRecord>,
    private readonly enableFormattedErrors: boolean = false,
  ) {
    // initiating transaction
    this.globalTxId = this.sendSingleAndParse(
      {
        oneofKind: "txOpen",
        txOpen: {
          name,
          enableFormattedErrors,
          writable: writable
            ? TxAPI_Open_Request_WritableTx.WRITABLE
            : TxAPI_Open_Request_WritableTx.NOT_WRITABLE,
        },
      },
      (r) => notEmpty(r.txOpen.tx?.id),
    );

    void this.track(this.globalTxId);

    // To avoid floating promise
    this.globalTxId.catch((err) => {
      if (!this.globalTxIdWasAwaited) {
        console.warn(err);
      }
    });

    // Adding stats
    this._stat.txCount++;
  }

  /**
   * Collect all pending promises for the transaction finalization.
   */
  public track<T>(promiseOrCallback: Promise<T> | (() => Promise<T>)): Promise<T> {
    return this.pending.track(promiseOrCallback);
  }

  private async drainAndAwaitPendingOps(): Promise<void> {
    // awaiting these pending operations first, to catch any errors
    await this.pending.awaitAll();
  }

  private sendSingleAndParse<Kind extends NonUndefined<ClientMessageRequest["oneofKind"]>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>) => T,
  ): Promise<T> {
    return this.pending.track(async () => {
      const rawResponsePromise = this.ll.send(r, false);

      void this.pending.track(rawResponsePromise);

      await this.drainAndAwaitPendingOps();

      // awaiting our result, and parsing the response
      return parser(await rawResponsePromise);
    });
  }

  private sendMultiAndParse<Kind extends NonUndefined<ClientMessageRequest["oneofKind"]>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>[]) => T,
  ): Promise<T> {
    return this.pending.track(async () => {
      const rawResponsePromise = this.ll.send(r, true);

      void this.pending.track(rawResponsePromise);

      await this.drainAndAwaitPendingOps();

      // awaiting our result, and parsing the response
      return parser(await rawResponsePromise);
    });
  }

  private async sendVoidSync<Kind extends NonUndefined<ClientMessageRequest["oneofKind"]>>(
    r: OneOfKind<ClientMessageRequest, Kind>,
  ): Promise<void> {
    await this.ll.send(r, false);
  }

  /** Requests sent with this method should never produce recoverable errors */
  private sendVoidAsync<Kind extends NonUndefined<ClientMessageRequest["oneofKind"]>>(
    r: OneOfKind<ClientMessageRequest, Kind>,
  ): void {
    void this.track(this.sendVoidSync(r));
  }

  private checkTxOpen() {
    if (this._completed) throw new Error("Transaction already closed");
  }

  public get completed() {
    return this._completed;
  }

  /** Commit & closes transaction. {@link TxCommitConflict} is thrown on
   * commit conflicts. */
  public async commit() {
    this.checkTxOpen();

    // tx will accept no requests after this one
    this._completed = true;

    if (!this.writable) {
      // no need to explicitly commit or reject read-only tx
      const completeResult = this.track(this.ll.complete());
      await this.drainAndAwaitPendingOps();
      await completeResult;
      await this.ll.await();
    } else {
      const commitResponse = this.track(
        this.sendSingleAndParse({ oneofKind: "txCommit", txCommit: {} }, (r) => r.txCommit.success),
      );

      // send closing frame right after commit to save some time on round-trips
      const completeResult = this.track(this.ll.complete());

      // now when we pushed all packets into the stream, we should wait for any
      // pending void operations from before, to catch any errors
      await this.drainAndAwaitPendingOps();

      if (!(await commitResponse)) throw new TxCommitConflict();

      await completeResult;

      // await event-loop completion
      await this.ll.await();
    }
  }

  public async discard() {
    this.checkTxOpen();

    // tx will accept no requests after this one
    this._completed = true;

    const discardResponse = this.sendVoidSync({ oneofKind: "txDiscard", txDiscard: {} });
    void this.track(discardResponse);
    // send closing frame right after commit to save some time on round-trips
    const completeResult = this.track(this.ll.complete());

    // now when we pushed all packets into the stream, we should wait for any
    // pending void operations from before, to catch any errors
    await this.drainAndAwaitPendingOps();

    await discardResponse;
    await completeResult;
    await this.ll.await();
  }

  //
  // Main tx methods
  //

  public get clientRoot(): ResourceId {
    return ensureResourceIdNotNull(this._clientRoot);
  }

  //
  // Resources
  //

  public createSingleton(
    name: string,
    type: ResourceType,
    errorIfExists: boolean = false,
  ): ResourceRef {
    const localId = this.nextLocalResourceId(false);

    const globalId = this.sendSingleAndParse(
      {
        oneofKind: "resourceCreateSingleton",
        resourceCreateSingleton: {
          type,
          id: localId,
          data: Buffer.from(name),
          errorIfExists,
        },
      },
      (r) => r.resourceCreateSingleton.resourceId as ResourceId,
    );

    void this.track(globalId);

    return { globalId, localId };
  }

  public getSingleton(name: string, loadFields: true): Promise<ResourceData>;
  public getSingleton(name: string, loadFields: false): Promise<BasicResourceData>;
  public getSingleton(
    name: string,
    loadFields: boolean = true,
  ): Promise<BasicResourceData | ResourceData> {
    return this.sendSingleAndParse(
      {
        oneofKind: "resourceGetSingleton",
        resourceGetSingleton: {
          data: Buffer.from(name),
          loadFields,
        },
      },
      (r) => protoToResource(notEmpty(r.resourceGetSingleton.resource)),
    );
  }

  private createResource<Kind extends NonUndefined<ClientMessageRequest["oneofKind"]>>(
    root: boolean,
    req: (localId: LocalResourceId) => OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>) => bigint,
  ): ResourceRef {
    const localId = this.nextLocalResourceId(root);

    const globalId = this.sendSingleAndParse(req(localId), (r) => parser(r) as ResourceId);

    void this.track(globalId);

    return { globalId, localId };
  }

  public createRoot(type: ResourceType): ResourceRef {
    this._stat.rootsCreated++;
    return this.createResource(
      true,
      (localId) => ({ oneofKind: "resourceCreateRoot", resourceCreateRoot: { type, id: localId } }),
      (r) => r.resourceCreateRoot.resourceId,
    );
  }

  public createStruct(type: ResourceType, data?: Uint8Array | string): ResourceRef {
    this._stat.structsCreated++;
    this._stat.structsCreatedDataBytes += data?.length ?? 0;
    return this.createResource(
      false,
      (localId) => ({
        oneofKind: "resourceCreateStruct",
        resourceCreateStruct: {
          type,
          id: localId,
          data:
            data === undefined ? undefined : typeof data === "string" ? Buffer.from(data) : data,
        },
      }),
      (r) => r.resourceCreateStruct.resourceId,
    );
  }

  public createEphemeral(type: ResourceType, data?: Uint8Array | string): ResourceRef {
    this._stat.ephemeralsCreated++;
    this._stat.ephemeralsCreatedDataBytes += data?.length ?? 0;
    return this.createResource(
      false,
      (localId) => ({
        oneofKind: "resourceCreateEphemeral",
        resourceCreateEphemeral: {
          type,
          id: localId,
          data:
            data === undefined ? undefined : typeof data === "string" ? Buffer.from(data) : data,
        },
      }),
      (r) => r.resourceCreateEphemeral.resourceId,
    );
  }

  public createValue(
    type: ResourceType,
    data: Uint8Array | string,
    errorIfExists: boolean = false,
  ): ResourceRef {
    this._stat.valuesCreated++;
    this._stat.valuesCreatedDataBytes += data?.length ?? 0;
    return this.createResource(
      false,
      (localId) => ({
        oneofKind: "resourceCreateValue",
        resourceCreateValue: {
          type,
          id: localId,
          data: typeof data === "string" ? Buffer.from(data) : data,
          errorIfExists,
        },
      }),
      (r) => r.resourceCreateValue.resourceId,
    );
  }

  public createJsonValue(data: unknown): ResourceRef {
    const jsonData = canonicalJsonBytes(data);
    return this.createValue(JsonObject, jsonData, false);
  }

  public createJsonGzValue(data: unknown, minSizeToGzip: number | undefined = 16_384): ResourceRef {
    const { data: jsonData, isGzipped } = canonicalJsonGzBytes(data, minSizeToGzip);
    return this.createValue(isGzipped ? JsonGzObject : JsonObject, jsonData, false);
  }

  public createError(message: string): ResourceRef {
    return this.createValue(
      ErrorResourceType,
      JSON.stringify({ message } satisfies ErrorResourceData),
    );
  }

  public setResourceName(name: string, rId: AnyResourceRef): void {
    this.sendVoidAsync({
      oneofKind: "resourceNameSet",
      resourceNameSet: { resourceId: toResourceId(rId), name },
    });
  }

  public deleteResourceName(name: string): void {
    this.sendVoidAsync({ oneofKind: "resourceNameDelete", resourceNameDelete: { name } });
  }

  public getResourceByName(name: string): Promise<ResourceId> {
    return this.sendSingleAndParse(
      { oneofKind: "resourceNameGet", resourceNameGet: { name } },
      (r) => ensureResourceIdNotNull(r.resourceNameGet.resourceId as OptionalResourceId),
    );
  }

  public checkResourceNameExists(name: string): Promise<boolean> {
    return this.sendSingleAndParse(
      { oneofKind: "resourceNameExists", resourceNameExists: { name } },
      (r) => r.resourceNameExists.exists,
    );
  }

  public removeResource(rId: ResourceId): void {
    this.sendVoidAsync({ oneofKind: "resourceRemove", resourceRemove: { id: rId } });
  }

  public resourceExists(rId: ResourceId): Promise<boolean> {
    return this.sendSingleAndParse(
      { oneofKind: "resourceExists", resourceExists: { resourceId: rId } },
      (r) => r.resourceExists.exists,
    );
  }

  /** This method may return stale resource state from cache if resource was removed */
  public async getResourceData(rId: AnyResourceRef, loadFields: true): Promise<ResourceData>;
  /** This method may return stale resource state from cache if resource was removed */
  public async getResourceData(rId: AnyResourceRef, loadFields: false): Promise<BasicResourceData>;
  /** This method may return stale resource state from cache if resource was removed */
  public async getResourceData(
    rId: AnyResourceRef,
    loadFields: boolean,
  ): Promise<BasicResourceData | ResourceData>;
  /** This method may return stale resource state from cache if ignoreCache == false if resource was removed */
  public async getResourceData(
    rId: AnyResourceRef,
    loadFields: true,
    ignoreCache: boolean,
  ): Promise<ResourceData>;
  /** This method may return stale resource state from cache if ignoreCache == false if resource was removed */
  public async getResourceData(
    rId: AnyResourceRef,
    loadFields: false,
    ignoreCache: boolean,
  ): Promise<BasicResourceData>;
  /** This method may return stale resource state from cache if ignoreCache == false if resource was removed */
  public async getResourceData(
    rId: AnyResourceRef,
    loadFields: boolean,
    ignoreCache: boolean,
  ): Promise<BasicResourceData | ResourceData>;
  @tracked
  public async getResourceData(
    rId: AnyResourceRef,
    loadFields: boolean = true,
    ignoreCache: boolean = false,
  ): Promise<BasicResourceData | ResourceData> {
    if (!ignoreCache && !isResourceRef(rId) && !isLocalResourceId(rId)) {
      // checking if we can return result from cache
      const fromCache = this.sharedResourceDataCache.get(rId);
      if (fromCache && fromCache.cacheTxOpenTimestamp < this.txOpenTimestamp) {
        if (!loadFields) {
          this._stat.rGetDataCacheHits++;
          this._stat.rGetDataCacheBytes += fromCache.basicData.data?.length ?? 0;
          return fromCache.basicData;
        } else if (fromCache.data) {
          this._stat.rGetDataCacheHits++;
          this._stat.rGetDataCacheBytes += fromCache.basicData.data?.length ?? 0;
          this._stat.rGetDataCacheFields += fromCache.data.fields.length;
          return fromCache.data;
        }
      }
    }

    const result = await this.sendSingleAndParse(
      {
        oneofKind: "resourceGet",
        resourceGet: { resourceId: toResourceId(rId), loadFields: loadFields },
      },
      (r) => protoToResource(notEmpty(r.resourceGet.resource)),
    );

    this._stat.rGetDataNetRequests++;
    this._stat.rGetDataNetBytes += result.data?.length ?? 0;
    this._stat.rGetDataNetFields += result.fields.length;

    // we will cache only final resource data states
    // caching result even if we were ignore the cache
    if (!isResourceRef(rId) && !isLocalResourceId(rId) && this.finalPredicate(result)) {
      deepFreeze(result);
      const fromCache = this.sharedResourceDataCache.get(rId);
      if (fromCache) {
        if (loadFields && !fromCache.data) {
          fromCache.data = result;
          // updating timestamp because we updated the record
          fromCache.cacheTxOpenTimestamp = this.txOpenTimestamp;
        }
      } else {
        const basicData = extractBasicResourceData(result);
        deepFreeze(basicData);
        if (loadFields)
          this.sharedResourceDataCache.set(rId, {
            basicData,
            data: result,
            cacheTxOpenTimestamp: this.txOpenTimestamp,
          });
        else
          this.sharedResourceDataCache.set(rId, {
            basicData,
            data: undefined,
            cacheTxOpenTimestamp: this.txOpenTimestamp,
          });
      }
    }

    return result;
  }

  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: true,
  ): Promise<ResourceData | undefined>;
  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: false,
  ): Promise<BasicResourceData | undefined>;
  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: boolean,
  ): Promise<BasicResourceData | ResourceData | undefined>;
  @tracked
  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: boolean = true,
  ): Promise<BasicResourceData | ResourceData | undefined> {
    // calling this method will ignore cache, because user intention is to detect resource absence
    // which cache will prevent
    const result = await notFoundToUndefined(
      async () => await this.getResourceData(rId, loadFields, true),
    );

    // cleaning cache record if resource was removed from the db
    if (result === undefined && !isResourceRef(rId) && !isLocalResourceId(rId))
      this.sharedResourceDataCache.delete(rId);

    return result;
  }

  /**
   * Inform platform that resource will not get any new input fields.
   * This is required, when client creates resource without schema and wants
   * controller to start calculations.
   * Most controllers will not start calculations even when all inputs
   * have their values, if inputs list is not locked.
   */
  public lockInputs(rId: AnyResourceRef): void {
    this._stat.inputsLocked++;
    this.sendVoidAsync({
      oneofKind: "resourceLockInputs",
      resourceLockInputs: { resourceId: toResourceId(rId) },
    });
  }

  /**
   * Inform platform that resource will not get any new output fields.
   * This is required for resource to pass deduplication.
   */
  public lockOutputs(rId: AnyResourceRef): void {
    this._stat.outputsLocked++;
    this.sendVoidAsync({
      oneofKind: "resourceLockOutputs",
      resourceLockOutputs: { resourceId: toResourceId(rId) },
    });
  }

  public lock(rID: AnyResourceRef): void {
    this.lockInputs(rID);
    this.lockOutputs(rID);
  }

  public setResourceError(rId: AnyResourceRef, ref: AnyResourceRef): void {
    this.sendVoidAsync({
      oneofKind: "resourceSetError",
      resourceSetError: { resourceId: toResourceId(rId), errorResourceId: toResourceId(ref) },
    });
  }

  //
  // Fields
  //

  public createField(fId: AnyFieldRef, fieldType: FieldType, value?: AnyRef): void {
    this._stat.fieldsCreated++;
    this.sendVoidAsync({
      oneofKind: "fieldCreate",
      fieldCreate: { type: fieldTypeToProto(fieldType), id: toFieldId(fId) },
    });
    if (value !== undefined) this.setField(fId, value);
  }

  public fieldExists(fId: AnyFieldRef): Promise<boolean> {
    return this.sendSingleAndParse(
      {
        oneofKind: "fieldExists",
        fieldExists: { field: toFieldId(fId) },
      },
      (r) => r.fieldExists.exists,
    );
  }

  public setField(fId: AnyFieldRef, ref: AnyRef): void {
    this._stat.fieldsSet++;
    if (isResource(ref))
      this.sendVoidAsync({
        oneofKind: "fieldSet",
        fieldSet: {
          field: toFieldId(fId),
          value: {
            resourceId: toResourceId(ref),
            fieldName: "", // default value, read as undefined
          },
        },
      });
    else
      this.sendVoidAsync({
        oneofKind: "fieldSet",
        fieldSet: {
          field: toFieldId(fId),
          value: toFieldId(ref),
        },
      });
  }

  public setFieldError(fId: AnyFieldRef, ref: AnyResourceRef): void {
    this._stat.fieldsSet++;
    this.sendVoidAsync({
      oneofKind: "fieldSetError",
      fieldSetError: { field: toFieldId(fId), errResourceId: toResourceId(ref) },
    });
  }

  public getField(fId: AnyFieldRef): Promise<FieldData> {
    this._stat.fieldsGet++;
    return this.sendSingleAndParse(
      { oneofKind: "fieldGet", fieldGet: { field: toFieldId(fId) } },
      (r) => protoToField(notEmpty(r.fieldGet.field)),
    );
  }

  @tracked
  public async getFieldIfExists(fId: AnyFieldRef): Promise<FieldData | undefined> {
    return notFoundToUndefined(async () => await this.getField(fId));
  }

  public resetField(fId: AnyFieldRef): void {
    this.sendVoidAsync({ oneofKind: "fieldReset", fieldReset: { field: toFieldId(fId) } });
  }

  public removeField(fId: AnyFieldRef): void {
    this.sendVoidAsync({ oneofKind: "fieldRemove", fieldRemove: { field: toFieldId(fId) } });
  }

  //
  // KV
  //

  @tracked
  public async listKeyValues(rId: AnyResourceRef): Promise<KeyValue[]> {
    const result = await this.sendMultiAndParse(
      {
        oneofKind: "resourceKeyValueList",
        resourceKeyValueList: { resourceId: toResourceId(rId), startFrom: "", limit: 0 },
      },
      (r) => r.map((e) => e.resourceKeyValueList.record!),
    );

    this._stat.kvListRequests++;
    this._stat.kvListEntries += result.length;
    for (const kv of result) this._stat.kvListBytes += kv.key.length + kv.value.length;

    return result;
  }

  @tracked
  public async listKeyValuesString(rId: AnyResourceRef): Promise<KeyValueString[]> {
    return (await this.listKeyValues(rId)).map(({ key, value }) => ({
      key,
      value: Buffer.from(value).toString(),
    }));
  }

  @tracked
  public async listKeyValuesIfResourceExists(rId: AnyResourceRef): Promise<KeyValue[] | undefined> {
    return notFoundToUndefined(async () => await this.listKeyValues(rId));
  }

  @tracked
  public async listKeyValuesStringIfResourceExists(
    rId: AnyResourceRef,
  ): Promise<KeyValueString[] | undefined> {
    return notFoundToUndefined(async () => await this.listKeyValuesString(rId));
  }

  public setKValue(rId: AnyResourceRef, key: string, value: Uint8Array | string): void {
    this._stat.kvSetRequests++;
    this._stat.kvSetBytes++;
    this.sendVoidAsync({
      oneofKind: "resourceKeyValueSet",
      resourceKeyValueSet: {
        resourceId: toResourceId(rId),
        key,
        value: toBytes(value),
      },
    });
  }

  public deleteKValue(rId: AnyResourceRef, key: string): void {
    this.sendVoidAsync({
      oneofKind: "resourceKeyValueDelete",
      resourceKeyValueDelete: {
        resourceId: toResourceId(rId),
        key,
      },
    });
  }

  @tracked
  public async getKValue(rId: AnyResourceRef, key: string): Promise<Uint8Array> {
    const result = await this.sendSingleAndParse(
      {
        oneofKind: "resourceKeyValueGet",
        resourceKeyValueGet: { resourceId: toResourceId(rId), key },
      },
      (r) => r.resourceKeyValueGet.value,
    );

    this._stat.kvGetRequests++;
    this._stat.kvGetBytes += result.length;

    return result;
  }

  @tracked
  public async getKValueString(rId: AnyResourceRef, key: string): Promise<string> {
    return Buffer.from(await this.getKValue(rId, key)).toString();
  }

  @tracked
  public async getKValueJson<T>(rId: AnyResourceRef, key: string): Promise<T> {
    return JSON.parse(await this.getKValueString(rId, key)) as T;
  }

  @tracked
  public async getKValueIfExists(
    rId: AnyResourceRef,
    key: string,
  ): Promise<Uint8Array | undefined> {
    const result = await this.sendSingleAndParse(
      {
        oneofKind: "resourceKeyValueGetIfExists",
        resourceKeyValueGetIfExists: { resourceId: toResourceId(rId), key },
      },
      (r) =>
        r.resourceKeyValueGetIfExists.exists ? r.resourceKeyValueGetIfExists.value : undefined,
    );

    this._stat.kvGetRequests++;
    this._stat.kvGetBytes += result?.length ?? 0;

    return result;
  }

  @tracked
  public async getKValueStringIfExists(
    rId: AnyResourceRef,
    key: string,
  ): Promise<string | undefined> {
    const data = await this.getKValueIfExists(rId, key);
    return data === undefined ? undefined : Buffer.from(data).toString();
  }

  @tracked
  public async getKValueJsonIfExists<T>(rId: AnyResourceRef, key: string): Promise<T | undefined> {
    const str = await this.getKValueString(rId, key);
    if (str === undefined) return undefined;
    return JSON.parse(str) as T;
  }

  //
  // Cache
  //
  // TODO

  //
  // High level ops
  //

  /** Resolves existing or create first level resource from */
  public getFutureFieldValue(rId: AnyRef, fieldName: string, fieldType: FutureFieldType): FieldRef {
    const data = Buffer.from(JSON.stringify({ fieldName, fieldType }));
    const getFieldResource = this.createEphemeral({ name: "json/getField", version: "1" }, data);
    this.setField({ resourceId: getFieldResource, fieldName: "resource" }, rId);
    return { resourceId: getFieldResource, fieldName: "result" };
  }

  //
  // Technical
  //

  public async getGlobalTxId() {
    this.globalTxIdWasAwaited = true;
    return await this.globalTxId;
  }

  /** Closes output event stream */
  public async complete() {
    if (this._completed) return;
    this._completed = true;
    const completeResult = this.track(this.ll.complete());
    await this.drainAndAwaitPendingOps();
    await completeResult;
  }

  /** Await incoming message loop termination and throw
   * any leftover errors if it was unsuccessful */
  public async await() {
    await this.ll.await();
  }

  //
  // Helpers
  //

  private nextLocalResourceId(root: boolean): LocalResourceId {
    return createLocalResourceId(root, ++this.localResourceIdCounter, this.localTxId);
  }

  private static localTxIdCounter = 0;

  private static nextLocalTxId() {
    PlTransaction.localTxIdCounter++;
    if (PlTransaction.localTxIdCounter === MaxTxId) PlTransaction.localTxIdCounter = 1;
    return PlTransaction.localTxIdCounter;
  }
}
