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
  FutureFieldType
} from './types';
import {
  createLocalResourceId,
  ensureResourceIdNotNull,
  MaxTxId
} from './types';
import type {
  ClientMessageRequest,
  LLPlTransaction,
  OneOfKind,
  ServerMessageResponse
} from './ll_transaction';
import { TxAPI_Open_Request_WritableTx } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import type { NonUndefined } from 'utility-types';
import { toBytes } from '../util/util';
import { fieldTypeToProto, protoToField, protoToResource } from './type_conversion';
import { notEmpty } from '@milaboratories/ts-helpers';
import { isNotFoundError } from './errors';

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
  return ref.hasOwnProperty('resourceId') && ref.hasOwnProperty('fieldName');
}

export function isResource(ref: AnyRef): ref is AnyResourceRef {
  return (
    typeof ref === 'bigint' || (ref.hasOwnProperty('globalId') && ref.hasOwnProperty('localId'))
  );
}

export function isFieldRef(ref: AnyFieldRef): ref is FieldRef {
  return isResourceRef(ref.resourceId);
}

export function isResourceRef(ref: AnyResourceRef): ref is ResourceRef {
  return ref.hasOwnProperty('globalId') && ref.hasOwnProperty('localId');
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
export class TxCommitConflict extends Error {}

async function notFoundToUndefined<T>(cb: () => Promise<T>): Promise<T | undefined> {
  try {
    return await cb();
  } catch (e: any) {
    if (isNotFoundError(e)) return undefined;
    throw e;
  }
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

  private localResourceIdCounter = 0;

  /** Store logical tx open / closed state to prevent invalid sequence of requests.
   * True means output stream was completed.
   * Contract: there must be no async operations between setting this field to true and sending complete signal to stream.*/
  private _completed = false;

  /** Void operation futures are placed into this pool, and corresponding method return immediately.
   * This is done to save number of round-trips. Next operation producing result will also await those
   * pending ops, to throw any pending errors. */
  private pendingVoidOps: Promise<void>[] = [];

  constructor(
    private readonly ll: LLPlTransaction,
    public readonly name: string,
    public readonly writable: boolean,
    private readonly _clientRoot: OptionalResourceId
  ) {
    // initiating transaction
    this.globalTxId = this.sendSingleAndParse(
      {
        oneofKind: 'txOpen',
        txOpen: {
          name,
          writable: writable
            ? TxAPI_Open_Request_WritableTx.WRITABLE
            : TxAPI_Open_Request_WritableTx.NOT_WRITABLE
        }
      },
      (r) => notEmpty(r.txOpen.tx?.id)
    );
  }

  private async drainAndAwaitPendingOps(): Promise<void> {
    if (this.pendingVoidOps.length === 0) return;

    // drain pending operations into temp array
    const pending = this.pendingVoidOps;
    this.pendingVoidOps = [];
    // awaiting these pending operations first, to catch any errors
    await Promise.all(pending);
  }

  private async sendSingleAndParse<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>) => T
  ): Promise<T> {
    // pushing operation packet to server
    const rawResponsePromise = this.ll.send(r, false);

    await this.drainAndAwaitPendingOps();

    // awaiting our result, and parsing the response
    return parser(await rawResponsePromise);
  }

  private async sendMultiAndParse<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>[]) => T
  ): Promise<T> {
    // pushing operation packet to server
    const rawResponsePromise = this.ll.send(r, true);

    await this.drainAndAwaitPendingOps();

    // awaiting our result, and parsing the response
    return parser(await rawResponsePromise);
  }

  private async sendVoidSync<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>
  ): Promise<void> {
    await this.ll.send(r, false);
  }

  /** Requests sent with this method should never produce recoverable errors */
  private sendVoidAsync<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>
  ): void {
    this.pendingVoidOps.push(this.sendVoidSync(r));
  }

  private checkTxOpen() {
    if (this._completed) throw new Error('Transaction already closed');
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
      const completeResult = this.ll.complete();
      await this.drainAndAwaitPendingOps();
      await completeResult;
      await this.ll.await();
    } else {
      const commitResponse = this.sendSingleAndParse(
        { oneofKind: 'txCommit', txCommit: {} },
        (r) => r.txCommit.success
      );

      // send closing frame right after commit to save some time on round-trips
      const completeResult = this.ll.complete();

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

    const discardResponse = this.sendVoidSync({ oneofKind: 'txDiscard', txDiscard: {} });
    // send closing frame right after commit to save some time on round-trips
    const completeResult = this.ll.complete();

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
    errorIfExists: boolean = false
  ): ResourceRef {
    const localId = this.nextLocalResourceId(false);

    const globalId = this.sendSingleAndParse(
      {
        oneofKind: 'resourceCreateSingleton',
        resourceCreateSingleton: {
          type,
          id: localId,
          data: Buffer.from(name),
          errorIfExists
        }
      },
      (r) => r.resourceCreateSingleton.resourceId as ResourceId
    );

    return { globalId, localId };
  }

  public async getSingleton(name: string, loadFields: true): Promise<ResourceData>;
  public async getSingleton(name: string, loadFields: false): Promise<BasicResourceData>;
  public async getSingleton(
    name: string,
    loadFields: boolean = true
  ): Promise<BasicResourceData | ResourceData> {
    return await this.sendSingleAndParse(
      {
        oneofKind: 'resourceGetSingleton',
        resourceGetSingleton: {
          data: Buffer.from(name),
          loadFields
        }
      },
      (r) => protoToResource(notEmpty(r.resourceGetSingleton.resource))
    );
  }

  private createResource<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>>(
    root: boolean,
    req: (localId: LocalResourceId) => OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>) => bigint
  ): ResourceRef {
    const localId = this.nextLocalResourceId(root);

    const globalId = this.sendSingleAndParse(req(localId), (r) => parser(r) as ResourceId);

    return { globalId, localId };
  }

  public createRoot(type: ResourceType): ResourceRef {
    return this.createResource(
      true,
      (localId) => ({ oneofKind: 'resourceCreateRoot', resourceCreateRoot: { type, id: localId } }),
      (r) => r.resourceCreateRoot.resourceId
    );
  }

  public createStruct(type: ResourceType, data?: Uint8Array | string): ResourceRef {
    return this.createResource(
      false,
      (localId) => ({
        oneofKind: 'resourceCreateStruct',
        resourceCreateStruct: {
          type,
          id: localId,
          data: data === undefined ? undefined : typeof data === 'string' ? Buffer.from(data) : data
        }
      }),
      (r) => r.resourceCreateStruct.resourceId
    );
  }

  public createEphemeral(type: ResourceType, data?: Uint8Array | string): ResourceRef {
    return this.createResource(
      false,
      (localId) => ({
        oneofKind: 'resourceCreateEphemeral',
        resourceCreateEphemeral: {
          type,
          id: localId,
          data: data === undefined ? undefined : typeof data === 'string' ? Buffer.from(data) : data
        }
      }),
      (r) => r.resourceCreateEphemeral.resourceId
    );
  }

  public createValue(
    type: ResourceType,
    data: Uint8Array | string,
    errorIfExists: boolean = false
  ): ResourceRef {
    return this.createResource(
      false,
      (localId) => ({
        oneofKind: 'resourceCreateValue',
        resourceCreateValue: {
          type,
          id: localId,
          data: typeof data === 'string' ? Buffer.from(data) : data,
          errorIfExists
        }
      }),
      (r) => r.resourceCreateValue.resourceId
    );
  }

  public setResourceName(name: string, rId: AnyResourceRef): void {
    this.sendVoidAsync({
      oneofKind: 'resourceNameSet',
      resourceNameSet: { resourceId: toResourceId(rId), name }
    });
  }

  public deleteResourceName(name: string): void {
    this.sendVoidAsync({ oneofKind: 'resourceNameDelete', resourceNameDelete: { name } });
  }

  public async getResourceByName(name: string): Promise<ResourceId> {
    return await this.sendSingleAndParse(
      { oneofKind: 'resourceNameGet', resourceNameGet: { name } },
      (r) => ensureResourceIdNotNull(r.resourceNameGet.resourceId as OptionalResourceId)
    );
  }

  public async checkResourceNameExists(name: string): Promise<boolean> {
    return await this.sendSingleAndParse(
      { oneofKind: 'resourceNameExists', resourceNameExists: { name } },
      (r) => r.resourceNameExists.exists
    );
  }

  public removeResource(rId: ResourceId): void {
    this.sendVoidAsync({ oneofKind: 'resourceRemove', resourceRemove: { id: rId } });
  }

  public async resourceExists(rId: ResourceId): Promise<boolean> {
    return await this.sendSingleAndParse(
      { oneofKind: 'resourceExists', resourceExists: { resourceId: rId } },
      (r) => r.resourceExists.exists
    );
  }

  public async getResourceData(rId: AnyResourceRef, loadFields: true): Promise<ResourceData>;
  public async getResourceData(rId: AnyResourceRef, loadFields: false): Promise<BasicResourceData>;
  public async getResourceData(
    rId: AnyResourceRef,
    loadFields: boolean
  ): Promise<BasicResourceData | ResourceData>;
  public async getResourceData(
    rId: AnyResourceRef,
    loadFields: boolean = true
  ): Promise<BasicResourceData | ResourceData> {
    return await this.sendSingleAndParse(
      {
        oneofKind: 'resourceGet',
        resourceGet: { resourceId: toResourceId(rId), loadFields: loadFields }
      },
      (r) => protoToResource(notEmpty(r.resourceGet.resource))
    );
  }

  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: true
  ): Promise<ResourceData | undefined>;
  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: false
  ): Promise<BasicResourceData | undefined>;
  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: boolean
  ): Promise<BasicResourceData | ResourceData | undefined>;
  public async getResourceDataIfExists(
    rId: AnyResourceRef,
    loadFields: boolean = true
  ): Promise<BasicResourceData | ResourceData | undefined> {
    return notFoundToUndefined(async () => await this.getResourceData(rId, loadFields));
  }

  /**
   * Inform platform that resource will not get any new input fields.
   * This is required, when client creates resource without schema and wants
   * controller to start calculations.
   * Most controllers will not start calculations even when all inputs
   * have their values, if inputs list is not locked.
   */
  public lockInputs(rId: AnyResourceRef): void {
    this.sendVoidAsync({
      oneofKind: 'resourceLockInputs',
      resourceLockInputs: { resourceId: toResourceId(rId) }
    });
  }

  /**
   * Inform platform that resource will not get any new output fields.
   * This is required for resource to pass deduplication.
   */
  public lockOutputs(rId: AnyResourceRef): void {
    this.sendVoidAsync({
      oneofKind: 'resourceLockOutputs',
      resourceLockOutputs: { resourceId: toResourceId(rId) }
    });
  }

  public lock(rID: AnyResourceRef): void {
    this.lockInputs(rID);
    this.lockOutputs(rID);
  }

  //
  // Fields
  //

  public createField(fId: AnyFieldRef, fieldType: FieldType, value?: AnyRef): void {
    this.sendVoidAsync({
      oneofKind: 'fieldCreate',
      fieldCreate: { type: fieldTypeToProto(fieldType), id: toFieldId(fId) }
    });
    if (value !== undefined) this.setField(fId, value);
  }

  public async fieldExists(fId: AnyFieldRef): Promise<boolean> {
    return await this.sendSingleAndParse(
      {
        oneofKind: 'fieldExists',
        fieldExists: { field: toFieldId(fId) }
      },
      (r) => r.fieldExists.exists
    );
  }

  public setField(fId: AnyFieldRef, ref: AnyRef): void {
    if (isResource(ref))
      this.sendVoidAsync({
        oneofKind: 'fieldSet',
        fieldSet: {
          field: toFieldId(fId),
          value: {
            resourceId: toResourceId(ref),
            fieldName: '' // default value, read as undefined
          }
        }
      });
    else
      this.sendVoidAsync({
        oneofKind: 'fieldSet',
        fieldSet: {
          field: toFieldId(fId),
          value: toFieldId(ref)
        }
      });
  }

  public setFieldError(fId: AnyFieldRef, ref: AnyResourceRef): void {
    this.sendVoidAsync({
      oneofKind: 'fieldSetError',
      fieldSetError: { field: toFieldId(fId), errResourceId: toResourceId(ref) }
    });
  }

  public async getField(fId: AnyFieldRef): Promise<FieldData> {
    return await this.sendSingleAndParse(
      { oneofKind: 'fieldGet', fieldGet: { field: toFieldId(fId) } },
      (r) => protoToField(notEmpty(r.fieldGet.field))
    );
  }

  public async getFieldIfExists(fId: AnyFieldRef): Promise<FieldData | undefined> {
    return notFoundToUndefined(async () => await this.getField(fId));
  }

  public resetField(fId: AnyFieldRef): void {
    this.sendVoidAsync({ oneofKind: 'fieldReset', fieldReset: { field: toFieldId(fId) } });
  }

  public removeField(fId: AnyFieldRef): void {
    this.sendVoidAsync({ oneofKind: 'fieldRemove', fieldRemove: { field: toFieldId(fId) } });
  }

  //
  // KV
  //

  public async listKeyValues(rId: AnyResourceRef): Promise<KeyValue[]> {
    return await this.sendMultiAndParse(
      {
        oneofKind: 'resourceKeyValueList',
        resourceKeyValueList: { resourceId: toResourceId(rId), startFrom: '', limit: 0 }
      },
      (r) => r.map((e) => e.resourceKeyValueList.record!)
    );
  }

  public async listKeyValuesString(rId: AnyResourceRef): Promise<KeyValueString[]> {
    return (await this.listKeyValues(rId)).map(({ key, value }) => ({
      key,
      value: Buffer.from(value).toString()
    }));
  }

  public async listKeyValuesIfResourceExists(rId: AnyResourceRef): Promise<KeyValue[] | undefined> {
    return notFoundToUndefined(async () => await this.listKeyValues(rId));
  }

  public async listKeyValuesStringIfResourceExists(
    rId: AnyResourceRef
  ): Promise<KeyValueString[] | undefined> {
    return notFoundToUndefined(async () => await this.listKeyValuesString(rId));
  }

  public setKValue(rId: AnyResourceRef, key: string, value: Uint8Array | string): void {
    this.sendVoidAsync({
      oneofKind: 'resourceKeyValueSet',
      resourceKeyValueSet: {
        resourceId: toResourceId(rId),
        key,
        value: toBytes(value)
      }
    });
  }

  public deleteKValue(rId: AnyResourceRef, key: string): void {
    this.sendVoidAsync({
      oneofKind: 'resourceKeyValueDelete',
      resourceKeyValueDelete: {
        resourceId: toResourceId(rId),
        key
      }
    });
  }

  public async getKValue(rId: AnyResourceRef, key: string): Promise<Uint8Array> {
    return await this.sendSingleAndParse(
      {
        oneofKind: 'resourceKeyValueGet',
        resourceKeyValueGet: { resourceId: toResourceId(rId), key }
      },
      (r) => r.resourceKeyValueGet.value
    );
  }

  public async getKValueString(rId: AnyResourceRef, key: string): Promise<string> {
    return Buffer.from(await this.getKValue(rId, key)).toString();
  }

  public async getKValueJson<T>(rId: AnyResourceRef, key: string): Promise<T> {
    return JSON.parse(await this.getKValueString(rId, key)) as T;
  }

  public async getKValueIfExists(
    rId: AnyResourceRef,
    key: string
  ): Promise<Uint8Array | undefined> {
    return await this.sendSingleAndParse(
      {
        oneofKind: 'resourceKeyValueGetIfExists',
        resourceKeyValueGetIfExists: { resourceId: toResourceId(rId), key }
      },
      (r) =>
        r.resourceKeyValueGetIfExists.exists ? r.resourceKeyValueGetIfExists.value : undefined
    );
  }

  public async getKValueStringIfExists(
    rId: AnyResourceRef,
    key: string
  ): Promise<string | undefined> {
    const data = await this.getKValueIfExists(rId, key);
    return data === undefined ? undefined : Buffer.from(data).toString();
  }

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
    const getFieldResource = this.createEphemeral({ name: 'json/getField', version: '1' }, data);
    this.setField({ resourceId: getFieldResource, fieldName: 'resource' }, rId);
    return { resourceId: getFieldResource, fieldName: 'result' };
  }

  //
  // Technical
  //

  public async getGlobalTxId() {
    return await this.globalTxId;
  }

  /** Closes output event stream */
  public async complete() {
    if (this._completed) return;
    this._completed = true;
    const completeResult = this.ll.complete();
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
