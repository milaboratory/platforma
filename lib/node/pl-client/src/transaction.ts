import {
  AnyResourceId,
  createLocalResourceId, ensureResourceIdNotNull, fieldTypeToProto,
  LocalResourceId,
  MaxTxId, OptionalResourceId, PlBasicResourceData, PlFieldData, PlFieldType, PlResourceData,
  PlResourceType, protoToField, protoToResource,
  ResourceId
} from './types';
import { ClientMessageRequest, LLPlTransaction, OneOfKind, ServerMessageResponse } from './ll_transaction';
import { TxAPI_Open_Request_WritableTx } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { NonUndefined } from 'utility-types';
import { notEmpty, toBytes } from './util/util';

/** Reference to resource, used only within transaction */
export interface ResourceRef {
  /** Global resource id of newly created resources, become available only
   * after response for the corresponding creation request is received. */
  readonly globalId: Promise<ResourceId>;

  /** Transaction-local resource id is assigned right after resource creation
   * request is sent, and can be used right away */
  readonly localId: LocalResourceId;
}

interface _FieldId<RId> {
  /** Parent resource id */
  resourceId: RId,
  /** Field name */
  fieldName: string
}

export type FieldId = _FieldId<ResourceId>
export type FieldRef = _FieldId<ResourceRef>
export type LocalFieldId = _FieldId<LocalResourceId>
export type AnyFieldId = FieldId | LocalFieldId;

export type AnyResourceRef = ResourceRef | ResourceId;
export type AnyFieldRef = _FieldId<AnyResourceRef>; // FieldRef | FieldId
export type AnyRef = AnyResourceRef | AnyFieldRef;

export function isField(ref: AnyRef): ref is AnyFieldRef {
  return ref.hasOwnProperty('resourceId') && ref.hasOwnProperty('fieldName');
}

export function isResource(ref: AnyRef): ref is AnyResourceRef {
  return typeof ref === 'bigint' ||
    (ref.hasOwnProperty('globalId') && ref.hasOwnProperty('localId'));
}

export function isFieldRef(ref: AnyFieldRef): ref is FieldRef {
  return isResourceRef(ref.resourceId);
}

export function isResourceRef(ref: AnyResourceRef): ref is ResourceRef {
  return ref.hasOwnProperty('globalId') && ref.hasOwnProperty('localId');
}

export function toFieldId(ref: AnyFieldRef): AnyFieldId {
  if (isFieldRef(ref))
    return { resourceId: ref.resourceId.localId, fieldName: ref.fieldName };
  else
    return ref as FieldId;
}

export async function toGlobalFieldId(ref: AnyFieldRef): Promise<FieldId> {
  if (isFieldRef(ref))
    return { resourceId: await ref.resourceId.globalId, fieldName: ref.fieldName };
  else
    return ref as FieldId;
}

export function toResourceId(ref: AnyResourceRef): AnyResourceId {
  if (isResourceRef(ref))
    return ref.localId;
  else
    return ref;
}

export async function toGlobalResourceId(ref: AnyResourceRef): Promise<ResourceId> {
  if (isResourceRef(ref))
    return await ref.globalId;
  else
    return ref;
}

/** If transaction commit failed due to write conflicts */
export class TxCommitConflict extends Error {
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
    this.globalTxId = this.sendAndParse({
      oneofKind: 'txOpen',
      txOpen: {
        name,
        writable: writable
          ? TxAPI_Open_Request_WritableTx.WRITABLE
          : TxAPI_Open_Request_WritableTx.NOT_WRITABLE
      }
    }, r => notEmpty(r.txOpen.tx?.id));
  }

  private async drainAndAwaitPendingOps(): Promise<void> {
    if (this.pendingVoidOps.length === 0)
      return;

    // drain pending operations into temp array
    const pending = this.pendingVoidOps;
    this.pendingVoidOps = [];
    // awaiting these pending operations first, to catch any errors
    await Promise.all(pending);
  }

  private async sendAndParse<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>) => T
  ): Promise<T> {
    // pushing operation packet to server
    const rawResponsePromise = this.ll.send(r);

    await this.drainAndAwaitPendingOps();

    // awaiting our result, and parsing the response
    return parser(await rawResponsePromise);
  }

  private async sendVoidSync<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>
  ): Promise<void> {
    await this.ll.send(r);
  }

  /** Requests sent with this method should never produce recoverable errors */
  private sendVoidAsync<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>, T>(
    r: OneOfKind<ClientMessageRequest, Kind>
  ): void {
    this.pendingVoidOps.push(this.sendVoidSync(r));
  }

  private checkTxOpen() {
    if (this._completed)
      throw new Error('Transaction already closed');
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
      const commitResponse = this.sendAndParse(
        { oneofKind: 'txCommit', txCommit: {} },
        r => r.txCommit.success
      );

      // send closing frame right after commit to save some time on round-trips
      const completeResult = this.ll.complete();

      // now when we pushed all packets into the stream, we should wait for any
      // pending void operations from before, to catch any errors
      await this.drainAndAwaitPendingOps();

      if (!await commitResponse)
        throw new TxCommitConflict();

      await completeResult;

      // await event-loop completion
      await this.ll.await();
    }
  }

  public async discard() {
    this.checkTxOpen();

    // tx will accept no requests after this one
    this._completed = true;

    const discardResponse = this.sendVoidSync(
      { oneofKind: 'txDiscard', txDiscard: {} }
    );
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

  public createSingleton(name: string, type: PlResourceType, errorIfExists: boolean = false): ResourceRef {
    const localId = this.nextLocalResourceId(false);

    const globalId = this.sendAndParse(
      {
        oneofKind: 'resourceCreateSingleton', resourceCreateSingleton: {
          type, id: localId, data: Buffer.from(name), errorIfExists
        }
      },
      r => r.resourceCreateSingleton.resourceId as ResourceId
    );

    return { globalId, localId };
  }

  public async getSingleton(name: string, loadFields: true): Promise<PlResourceData>;
  public async getSingleton(name: string, loadFields: false): Promise<PlBasicResourceData>;
  public async getSingleton(name: string, loadFields: boolean = true): Promise<PlBasicResourceData | PlResourceData> {
    return await this.sendAndParse(
      {
        oneofKind: 'resourceGetSingleton', resourceGetSingleton: {
          data: Buffer.from(name), loadFields
        }
      },
      r => protoToResource(notEmpty(r.resourceGetSingleton.resource))
    );
  }

  private createResource<Kind extends NonUndefined<ClientMessageRequest['oneofKind']>>(
    root: boolean,
    req: (localId: LocalResourceId) => OneOfKind<ClientMessageRequest, Kind>,
    parser: (resp: OneOfKind<ServerMessageResponse, Kind>) => bigint
  ): ResourceRef {
    const localId = this.nextLocalResourceId(root);

    const globalId = this.sendAndParse(
      req(localId),
      r => parser(r) as ResourceId
    );

    return { globalId, localId };
  }

  public createRoot(type: PlResourceType): ResourceRef {
    return this.createResource(true,
      localId => ({ oneofKind: 'resourceCreateRoot', resourceCreateRoot: { type, id: localId } }),
      r => r.resourceCreateRoot.resourceId
    );
  }

  public createStruct(type: PlResourceType, data?: Uint8Array): ResourceRef {
    return this.createResource(false,
      localId => ({ oneofKind: 'resourceCreateStruct', resourceCreateStruct: { type, id: localId, data } }),
      r => r.resourceCreateStruct.resourceId
    );
  }

  public createEphemeral(type: PlResourceType, data?: Uint8Array): ResourceRef {
    return this.createResource(false,
      localId => ({ oneofKind: 'resourceCreateEphemeral', resourceCreateEphemeral: { type, id: localId, data } }),
      r => r.resourceCreateEphemeral.resourceId
    );
  }

  public createValue(type: PlResourceType, data: Uint8Array, errorIfExists: boolean = false): ResourceRef {
    return this.createResource(false,
      localId => ({
        oneofKind: 'resourceCreateValue',
        resourceCreateValue: { type, id: localId, data, errorIfExists }
      }),
      r => r.resourceCreateValue.resourceId
    );
  }

  public setResourceName(name: string, rId: AnyResourceRef): void {
    this.sendVoidAsync(
      { oneofKind: 'resourceNameSet', resourceNameSet: { resourceId: toResourceId(rId), name } }
    );
  }

  public deleteResourceName(name: string): void {
    this.sendVoidAsync(
      { oneofKind: 'resourceNameDelete', resourceNameDelete: { name } }
    );
  }

  public async getResourceByName(name: string): Promise<ResourceId> {
    return await this.sendAndParse(
      { oneofKind: 'resourceNameGet', resourceNameGet: { name } },
      r => ensureResourceIdNotNull(r.resourceNameGet.resourceId as OptionalResourceId)
    );
  }

  public async checkResourceNameExists(name: string): Promise<boolean> {
    return await this.sendAndParse(
      { oneofKind: 'resourceNameExists', resourceNameExists: { name } },
      r => r.resourceNameExists.exists
    );
  }

  public removeResource(rId: ResourceId): void {
    this.sendVoidAsync({ oneofKind: 'resourceRemove', resourceRemove: { id: rId } });
  }

  public async resourceExists(rId: ResourceId): Promise<boolean> {
    return await this.sendAndParse(
      { oneofKind: 'resourceExists', resourceExists: { resourceId: rId } },
      r => r.resourceExists.exists);
  }

  public async getResourceData(rId: AnyResourceRef, loadFields: true): Promise<PlResourceData>;
  public async getResourceData(rId: AnyResourceRef, loadFields: false): Promise<PlBasicResourceData>;
  public async getResourceData(rId: AnyResourceRef, loadFields: boolean = true): Promise<PlBasicResourceData | PlResourceData> {
    return await this.sendAndParse({
        oneofKind: 'resourceGet',
        resourceGet: { resourceId: toResourceId(rId), loadFields: loadFields }
      },
      r => protoToResource(notEmpty(r.resourceGet.resource))
    );
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
      }
    );
  }

  /**
   * Inform platform that resource will not get any new output fields.
   * This is required for resource to pass deduplication.
   */
  public lockOutputs(rId: AnyResourceRef): void {
    this.sendVoidAsync({
        oneofKind: 'resourceLockOutputs',
        resourceLockOutputs: { resourceId: toResourceId(rId) }
      }
    );
  }

  public lock(rID: AnyResourceRef): void {
    this.lockInputs(rID);
    this.lockOutputs(rID);
  }

  //
  // Fields
  //

  public createField(fId: AnyFieldRef, fieldType: PlFieldType): void {
    this.sendVoidAsync({
        oneofKind: 'fieldCreate',
        fieldCreate: { type: fieldTypeToProto(fieldType), id: toFieldId(fId) }
      }
    );
  }

  public async fieldExists(fId: AnyFieldRef): Promise<boolean> {
    return await this.sendAndParse({
        oneofKind: 'fieldExists',
        fieldExists: { field: toFieldId(fId) }
      },
      r => r.fieldExists.exists
    );
  }

  public setField(fId: AnyFieldRef, ref: AnyRef): void {
    if (isResource(ref))
      this.sendVoidAsync({
          oneofKind: 'fieldSet',
          fieldSet: {
            field: toFieldId(fId), value:
              {
                resourceId: toResourceId(ref),
                fieldName: '' // default value, read as undefined
              }
          }
        }
      );
    else
      this.sendVoidAsync({
          oneofKind: 'fieldSet',
          fieldSet: {
            field: toFieldId(fId),
            value: toFieldId(ref)
          }
        }
      );
  }

  public setFieldError(fId: AnyFieldRef, ref: AnyResourceRef): void {
    this.sendVoidAsync({
      oneofKind: 'fieldSetError',
      fieldSetError: { field: toFieldId(fId), errResourceId: toResourceId(ref) }
    });
  }

  public async getField(fId: AnyFieldRef): Promise<PlFieldData> {
    return await this.sendAndParse(
      { oneofKind: 'fieldGet', fieldGet: { field: toFieldId(fId) } },
      r => protoToField(notEmpty(r.fieldGet.field))
    );
  }

  public resetField(fId: AnyFieldRef): void {
    this.sendVoidAsync(
      { oneofKind: 'fieldReset', fieldReset: { field: toFieldId(fId) } }
    );
  }

  public removeField(fId: AnyFieldRef): void {
    this.sendVoidAsync(
      { oneofKind: 'fieldRemove', fieldRemove: { field: toFieldId(fId) } }
    );
  }

  //
  // KV
  //

  public setKValue(rId: AnyResourceRef, key: string, value: Uint8Array | string): void {
    this.sendVoidAsync({
      oneofKind: 'resourceKeyValueSet', resourceKeyValueSet: {
        resourceId: toResourceId(rId), key,
        value: toBytes(value)
      }
    });
  }

  public async getKValue(rId: AnyResourceRef, key: string): Promise<Uint8Array> {
    return await this.sendAndParse(
      { oneofKind: 'resourceKeyValueGet', resourceKeyValueGet: { resourceId: toResourceId(rId), key } },
      r => r.resourceKeyValueGet.value
    );
  }

  public async getKValueString(rId: AnyResourceRef, key: string): Promise<string> {
    return Buffer.from(await this.getKValue(rId, key)).toString();
  }

  public async getKValueIfExists(rId: AnyResourceRef, key: string): Promise<Uint8Array | undefined> {
    return await this.sendAndParse(
      { oneofKind: 'resourceKeyValueGetIfExists', resourceKeyValueGetIfExists: { resourceId: toResourceId(rId), key } },
      r => r.resourceKeyValueGetIfExists.exists ? r.resourceKeyValueGetIfExists.value : undefined
    );
  }

  public async getKValueStringIfExists(rId: AnyResourceRef, key: string): Promise<string | undefined> {
    const data = await this.getKValueIfExists(rId, key);
    return data === undefined ? undefined : Buffer.from(data).toString();
  }

  //
  // Cache
  //
  // TODO

  //
  // High level ops
  //

  /** Resolves existing or create first level resource from */
  public getFutureFieldValue(rId: AnyResourceRef,
                             fieldName: string,
                             fieldType: 'Output' | 'Input' | 'Service'
  ): FieldRef {
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
    if (this._completed)
      return;
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
    if (PlTransaction.localTxIdCounter === MaxTxId)
      PlTransaction.localTxIdCounter = 1;
    return PlTransaction.localTxIdCounter;
  }

// public async resourceRemove(rID: $Resource) {
//   return this.send<void, 'resourceRemove'>(
//     m.resourceRemove(await rID.ID(this.internalTxId)),
//     (msg, parsed) => parsed()
//   );
// }
//
// public createResourceStruct(resourceType: ResourceType, options: { root?: boolean; clean?: boolean }) {
//   return options.root ? this.createRoot(resourceType, options) : this.createStruct(resourceType);
// }
//
// public createRoot(resourceType: RLType, options?: { clean?: boolean }): $Resource {
//   const localID = this.#nextResourceRootId();
//
//   const idResolver = this.send<bigint, 'resourceCreateRoot'>(
//     m.resourceCreateRoot(localID, normalizeResourceType(resourceType)),
//     (msg, parsed) => {
//       parsed(msg.resourceCreateRoot.resourceId);
//     }
//   );
//
//   const $resource = $Resource.local(localID, this, unfold(idResolver));
//
//   if (options?.clean) {
//     this.client.toClean.$resources.push($resource);
//   }
//
//   return $resource;
// }
//
// public createStruct(resourceType: RLType, data?: Uint8Array): $Resource {
//   const localID = this.#nextResourceLocalID();
//
//   const idResolver = this.send<bigint, 'resourceCreateStruct'>(
//     m.resourceCreateStruct(localID, normalizeResourceType(resourceType), data),
//     (msg, parsed) => {
//       parsed(msg.resourceCreateStruct.resourceId);
//     }
//   );
//
//   return $Resource.local(localID, this, unfold(idResolver));
// }
//
// public createEphemeral(resourceType: ResourceType, data?: Uint8Array): $Resource {
//   const localID = this.#nextResourceLocalID();
//
//   const idResolver = this.send<bigint, 'resourceCreateEphemeral'>(
//     m.resourceCreateEphemeral(localID, resourceType, data),
//     (msg, parsed) => {
//       parsed(msg.resourceCreateEphemeral.resourceId);
//     }
//   );
//
//   return $Resource.local(localID, this, unfold(idResolver));
// }
//
// public createBContextEndV1() {
//   return this.createEphemeral({
//     name: 'BContextEnd',
//     version: '1'
//   }, Buffer.from('null'));
// }
//
// public createEphemeralRenderTemplateV1() {
//   return this.createEphemeral({
//     name: 'EphRenderTemplate',
//     version: '1'
//   });
// }
//
// public createStdMapV1() {
//   return this.createStruct({
//     name: 'std/map',
//     version: '1'
//   });
// }
//
// public createEphStdMapV1() {
//   return this.createEphemeral({
//     name: 'EphStdMap',
//     version: '1'
//   });
// }
//
// public createContentMapV1() {
//   return this.createStruct({
//     name: 'ContentMap',
//     version: '1'
//   });
// }
//
// public async createFutureFieldId(fieldType: FieldType, fieldName: string) {
//   return this.createEphemeral({
//     name: 'json/getField',
//     version: '1'
//   }, Buffer.from(JSON.stringify({
//     fieldName,
//     fieldType: call(() => {
//       if (fieldType === FieldType.OUTPUT) {
//         return 'Output';
//       }
//
//       throw Error('Unsupported field type: ' + fieldType);
//     })
//   })));
// }
//
// public async getFutureFieldByResource(target: $Resource, fieldType: FieldType, fieldName: string) {
//   const s = await this.createFutureFieldId(fieldType, fieldName);
//   await this.setField(s.FieldID('resource'), target);
//   return s.FieldID('result');
// }
//
// public async getFutureOutputByResource(target: $Resource, fieldName: string) {
//   const s = await this.createFutureFieldId(FieldType.OUTPUT, fieldName);
//   await this.setField(s.FieldID('resource'), target);
//   return s.FieldID('result');
// }
//
// public async createChild(resourceType: RLType, $parentField: $Field): Promise<$Resource> {
//   const localID = this.#nextResourceLocalID();
//
//   const idResolver = this.send<bigint, 'resourceCreateChild'>(
//     {
//       oneofKind: 'resourceCreateChild',
//       resourceCreateChild: {
//         id: localID,
//         type: normalizeResourceType(resourceType),
//         parentField: await $parentField.Ref(this)
//       }
//     },
//     (msg, parsed) => {
//       parsed(msg.resourceCreateChild.resourceId);
//     }
//   );
//
//   return $Resource.local(localID, this, unfold(idResolver));
// }
//
// public createValue(resourceValue: ResourceValue): $Resource {
//   return this.createValueFromBuffer(resourceValue, serializeValue(resourceValue.name, resourceValue.value));
// }
//
// public createValueFrom<V = unknown>(value: V): $Resource {
//   const resourceValue = resolveResourceValue(value);
//   return this.createValueFromBuffer(resourceValue, serializeValue(resourceValue.name, resourceValue.value));
// }
//
// public createValueFromBuffer(resourceType: ResourceValueType, data: Uint8Array): $Resource {
//   const localID = this.#nextResourceLocalID();
//
//   const idResolver = this.send<bigint, 'resourceCreateValue'>(
//     m.resourceCreateValue(localID, resourceType, data),
//     (msg, parsed) => {
//       parsed(msg.resourceCreateValue.resourceId);
//     }
//   );
//
//   return $Resource.local(localID, this, unfold(idResolver));
// }
//
// public async resourceExists(rID: $Resource | bigint): Promise<boolean> {
//   const resourceId = typeof rID === 'bigint' ? rID : await rID.ID(this.internalTxId);
//   return unfold(this.send<boolean, 'resourceExists'>(
//     m.resourceExists(resourceId),
//     (msg, parsed) => parsed(msg.resourceExists.exists)
//   ));
// }
//
// public async fieldExists(fieldRef: FieldRef): Promise<boolean> {
//   return unfold(this.send<boolean, 'fieldExists'>(
//     m.fieldExists(fieldRef),
//     (msg, parsed) => parsed(msg.fieldExists.exists)
//   ));
// }
//
// public async getResource(rID: $Resource | bigint, loadFields: boolean = true): Promise<PlResource> {
//   const resourceId = typeof rID === 'bigint' ? rID : await rID.ID(this.internalTxId);
//   return unfold(this.send<PlResource, 'resourceGet'>(
//     m.resourceGet(resourceId, loadFields),
//     (msg, parsed, failed) => {
//       const { resource } = msg.resourceGet;
//
//       if (resource === undefined) {
//         return failed(Error('server returned no resource info'));
//       }
//
//       parsed(resource as PlResource);
//     }
//   ));
// }
//
// public async getResourceData(r: $Resource | bigint) {
//   const $err = await this.getResource(r, false);
//   return $err.data.toString();
// }
//
// public async getResourceFields(rID: $Resource | bigint) {
//   const resource = await this.getResource(rID, true);
//   return resource.fields.map(f => f as PlField);
// }
//
// // Inform platform that resource will not get any new input fields.
// // This is required, when client creates resource without schema and wants
// // controller to start calculations.
// // Most controllers will not start calculations even when all inputs
// // have their values, if inputs list is not locked.
// public async lockInputs(rID: $Resource) {
//   return this.send<void, 'resourceLockInputs'>(
//     m.lockInputs(await rID.ID(this.internalTxId)),
//     (msg, parsed) => {
//       parsed(undefined);
//     }
//   );
// }
//
// // Inform platform that resource will not get any new output fields.
// // This is required for resource to pass deduplication.
// public async lockOutputs(rID: $Resource) {
//   return this.send<void, 'resourceLockOutputs'>(
//     m.lockOutputs(
//       await rID.ID(this.internalTxId)
//     ),
//     (msg, parsed) => {
//       parsed(undefined);
//     }
//   );
// }
//
// public async lock(rID: $Resource) {
//   await this.lockInputs(rID);
//   await this.lockOutputs(rID);
// }
//
// public createSubscription() {
//   const localID = this.#nextResourceLocalID();
//
//   const idResolver = this.send<bigint, 'subscriptionCreate'>(
//     {
//       oneofKind: 'subscriptionCreate',
//       subscriptionCreate: {
//         id: localID,
//         blocking: false,
//         gc: false // @todo attach to session object
//       }
//     },
//     (msg, parsed) => {
//       parsed(msg.subscriptionCreate.subscriptionId);
//     }
//   );
//
//   return $Resource.local(localID, this, unfold(idResolver));
// }
//
// public async createSubscriptionResourceFilter(s: $Resource) {
//   const localID = this.#nextResourceLocalID();
//
//   const resourceId = await s.ID(this.internalTxId);
//
//   const idResolver = this.send<bigint, 'subscriptionCreateFilter'>({
//       oneofKind: 'subscriptionCreateFilter',
//       subscriptionCreateFilter: {
//         id: localID,
//         filter: {
//           resourceFilter: {
//             oneofKind: 'resourceId',
//             resourceId
//           },
//           eventFilter: {
//             all: true
//           }
//         }
//       }
//     },
//     (msg, parsed) => {
//       parsed(msg.subscriptionCreateFilter.filterId); //
//     });
//
//   return $Resource.local(localID, this, unfold(idResolver));
// }
//
// public async createSubscriptionFilter(filter: NotificationFilter) {
//   const localID = this.#nextResourceLocalID();
//
//   const idResolver = this.send<bigint, 'subscriptionCreateFilter'>({
//       oneofKind: 'subscriptionCreateFilter',
//       subscriptionCreateFilter: {
//         id: localID,
//         filter
//       }
//     },
//     (msg, parsed) => {
//       parsed(msg.subscriptionCreateFilter.filterId);
//     });
//
//   return $Resource.local(localID, this, unfold(idResolver));
// }
//
// public async attachSubscriptionFilter($subscription: $Resource, filterName: string, $filter: $Resource) {
//   return this.send<void, 'subscriptionAttachFilter'>(
//     {
//       oneofKind: 'subscriptionAttachFilter',
//       subscriptionAttachFilter: {
//         subscriptionId: await $subscription.ID(this.internalTxId),
//         filterName,
//         filterId: await $filter.ID(this.internalTxId)
//       }
//     },
//     (msg, parsed) => parsed(undefined)
//   );
// }
//
// public async createField($field: $Field, fieldType: FieldType): SendResult<FieldRef> {
//   return this.send<FieldRef, 'fieldCreate'>(
//     m.fieldCreate(
//       await $field.Ref(this),
//       fieldType
//     ),
//     (msg, parsed, failed) => {
//       const globalID = msg.fieldCreate.globalId;
//
//       if (globalID === undefined) {
//         failed(Error('server returned no field info'));
//         return;
//       }
//
//       parsed({ resourceId: globalID.resourceId, fieldName: globalID.fieldName });
//     }
//   );
// }
//
// public async createFieldAndSet(options: {
//   field: $Field;
//   fieldType: FieldType;
//   target: $Reference | ResourceValue | undefined;
// }) {
//   const { field, fieldType, target } = options;
//   await this.createField(field, fieldType);
//
//   if (target) {
//     const t = target instanceof $Reference ? target : this.createValue(target);
//     return this.setField(field, t);
//   }
//
//   return field;
// }
//
// public async createInputFieldAndSet(options: {
//   field: $Field;
//   target: $Reference | ResourceValue | undefined;
// }) {
//   return this.createFieldAndSet({
//     field: options.field,
//     fieldType: FieldType.INPUT,
//     target: options.target
//   });
// }
//
// public async createOneTimeWritableFieldAndSet(options: {
//   field: $Field;
//   target: $Reference | ResourceValue | undefined;
// }) {
//   return this.createFieldAndSet({
//     field: options.field,
//     fieldType: FieldType.ONE_TIME_WRITABLE,
//     target: options.target
//   });
// }
//
// public async createDynamicFieldAndSet(options: {
//   field: $Field;
//   target: $Reference | ResourceValue | undefined;
// }) {
//   return this.createFieldAndSet({
//     field: options.field,
//     fieldType: FieldType.DYNAMIC,
//     target: options.target
//   });
// }
//
// public async setField($field: $Field, target: $Reference | ResourceValue) {
//   const $target = target instanceof $Reference ? target : this.createValue(target);
//
//   await this.send<void, 'fieldSet'>(
//     m.setFieldRef(
//       await $field.Ref(this),
//       await $target.Ref(this)
//     ),
//     (msg, parsed) => parsed(undefined)
//   );
//
//   return $field;
// }
//
// public async setFieldValue(field: $Field, desc: ResourceValue) {
//   return this.setField(field, this.createValueFromBuffer({
//     name: desc.name,
//     version: desc.version
//   }, serializeValue(desc.name, desc.value)));
// }
//
// public async resetField($field: $Field) {
//   return this.send<void, 'fieldReset'>(
//     {
//       oneofKind: 'fieldReset',
//       fieldReset: {
//         field: await $field.Ref(this)
//       }
//     },
//     (msg, parsed) => parsed(undefined)
//   );
// }
//
// public async removeField($field: $Field) {
//   return this.send<void, 'fieldRemove'>(
//     {
//       oneofKind: 'fieldRemove',
//       fieldRemove: {
//         field: await $field.Ref(this)
//       }
//     },
//     (msg, parsed) => parsed(undefined)
//   );
// }
//
// public async getField($field: $Field): Promise<PlField> {
//   return unfold(this.send<PlField, 'fieldGet'>(
//     m.fieldGet(await $field.rRef(this)),
//     (msg, parsed, failed) => {
//       const { field } = msg.fieldGet;
//       if (field === undefined) {
//         return failed(Error('server returned no field info'));
//       }
//       parsed(field as PlField);
//     }
//   ));
// }
//
// public async getFieldResource(fieldOrRef: Field | $Field, loadFields = true) {
//   const field = await this.#resolveField(fieldOrRef);
//
//   if (field.error) {
//     const err = await this.getResource(field.error, false);
//     throw Error(`Error in field ${jsonStringify(fieldOrRef)}: ${errToString(err)}`);
//   }
//
//   if (field.value === 0n) {
//     return undefined;
//   }
//
//   return this.getResource(field.value, loadFields);
// }
//
// public async loadFieldResource(fieldOrRef: Field | $Field) {
//   const field = await this.#resolveField(fieldOrRef);
//
//   if (field.error) {
//     return this.getResource(field.error);
//   }
//
//   if (field.value === 0n) {
//     return undefined;
//   }
//
//   return this.getResource(field.value);
// }
//
// // @TODO, ask Gleb
// public async getFieldResourceSafe(fieldOrRef: Field | $Field, loadFields = true) {
//   const field = await this.#resolveField(fieldOrRef);
//
//   if (field.value === 0n) {
//     return undefined;
//   }
//
//   return this.getResource(field.value, loadFields);
// }
//
// // @TODO
// public async getFieldResourceOrError(fieldOrRef: Field | $Field, loadFields = true) {
//   const field = await this.#resolveField(fieldOrRef);
//
//   if (field.error) {
//     return await this.getResource(field.error, false);
//   }
//
//   if (field.value === 0n) {
//     this.logger.debug('getFieldResourceOrError empty value for field: ' + jsonStringify(field)); // @TODO
//     return undefined;
//   }
//
//   return this.getResource(field.value, loadFields);
// }
//
// public async isFieldResourceExists(fieldOrRef: Field | $Field) {
//   const field = await this.#resolveField(fieldOrRef);
//
//   if (field.value === 0n) {
//     return false;
//   }
//
//   return this.resourceExists(field.value);
// }
//
// public async getFieldResourceOptional(fieldOrRef: Field | $Field) {
//   const $field = $Field.from(this.ctx, fieldOrRef);
//
//   const ref = await $field.rRef(this);
//
//   const exists = await this.fieldExists(ref);
//
//   if (!exists) {
//     return undefined;
//   }
//
//   const field = await this.#resolveField(fieldOrRef);
//
//   if (field.value === 0n) {
//     return undefined;
//   }
//
//   if (!await this.resourceExists(field.value)) {
//     this.logger.warn('Resource does not exist');
//     return undefined;
//   }
//
//   return this.getResource(field.value, true);
// }
//
// public async getResourceValue(resource: Resource) {
//   return deserializeValue(resource);
// }
//
// async loadChildResources(resource: Resource | Resource[]) {
//   const fields = ensureArray(resource).flatMap(r => r.fields);
//
//   const res = await Promise.all(fields.map(field => {
//     return this.loadFieldResource(field);
//   })).then(lst => lst.filter(r => r) as PlResource[]);
//
//   return res;
// }
//
// async loadChildResourcesRecursive(resources: PlResource[], store: RMap = new RMap): Promise<RMap> {
//   const children = await this.loadChildResources(resources);
//
//   store.setResources([...resources, ...children]);
//
//   if (!children.length) {
//     return store;
//   }
//
//   return this.loadChildResourcesRecursive(children, store);
// }
//
// // @TODO replace this with the API implemented on the backend
// async getResourceTree($resource: $Resource | bigint): Promise<PlResource[]> {
//   const resource = await this.getResource($resource);
//
//   const children = await this.loadChildResourcesRecursive([resource]);
//
//   children.setResources([resource]);
//
//   return children.asArray();
// }
//
// async getResourceResults($resource: $Resource, fieldNames?: string[]): Promise<Record<string, Result<unknown>>> {
//   const fields = await $resource.getResourceFields(this);
//   const attrs: Record<string, Result<unknown>> = {};
//   const filtered = fieldNames ? fields.filter(field => fieldNames.includes(field.id.fieldName)) : fields;
//
//   await Promise.all(filtered.map(field => {
//     return this.getFieldResult(field).then(res => attrs[field.id.fieldName] = res ?? null);
//   }));
//
//   return attrs;
// }
//
// public async getFieldResult<T = unknown>(fieldOrRef: Field | $Field): Promise<Result<T | undefined>> {
//   const field = await this.#resolveField(fieldOrRef);
//
//   if (field.error) {
//     const err = await this.getResource(field.error, false);
//     return { ok: false, error: errToString(err) };
//   }
//
//   if (field.value === 0n) {
//     return {
//       ok: true,
//       value: undefined
//     };
//   }
//
//   const resource = await this.getResource(field.value);
//
//   const { type, kind } = resource;
//
//   if (!type) {
//     throw Error('Empty resource type');
//   }
//
//   if (kind === Resource_Kind.STRUCTURAL) {
//     const errors = [] as string[];
//
//     const result = await this.getResourceResults($Resource.from(this.ctx, resource));
//
//     const record: Record<string, unknown> = {};
//
//     if (type.name === 'StreamManager') { // temp @todo deserializeResource
//       record.resourceId = String(resource.id);
//       record.type = type;
//     }
//
//     if (type.name.startsWith('BlobIndex/')) { // temp @todo deserializeResource
//       record.resourceId = String(resource.id);
//       record.type = type;
//     }
//
//     for (const key of Object.keys(result)) {
//       const r = result[key];
//       if (r.ok) {
//         record[key] = r.value;
//       } else {
//         errors.push(`${key}: ${r.error}`);
//       }
//     }
//
//     if (errors.length) {
//       return {
//         ok: false,
//         error: errors.join('\n')
//       };
//     }
//
//     return {
//       ok: true,
//       value: record
//     } as Result<T>;
//   }
//
//   return {
//     ok: true,
//     value: deserializeValue(resource) as T
//   };
// }
//
// public async getFieldValue<T = unknown>(fieldOrRef: Field | $Field): Promise<T | undefined> {
//   return this.getFieldResult<T>(fieldOrRef).then(r => okValue(r));
// }
//
// public async ackNotification(n: Notification): Promise<void> {
//   return unfold(this.send<void, 'notificationAck'>(
//     m.ackNotification(n.subscriptionId, n.eventId),
//     (msg, parsed) => {
//       parsed(undefined);
//     }
//   ));
// }
//
// public async getResourceIdByName(name: string): Promise<$Resource> {
//   const resp = await this.send<bigint, 'resourceNameGet'>(
//     m.resourceNameGet(name),
//     (msg, parsed) => {
//       parsed(msg.resourceNameGet.resourceId);
//     }
//   );
//
//   const rId = await resp.response;
//
//   return $Resource.global(this.ctx, rId);
// }
//
// public async setResourceName(rId: $Resource, name: string) {
//   const resourceId = await rId.ID();
//
//   await this.send<void, 'resourceNameSet'>(
//     m.resourceNameSet(resourceId, name),
//     (msg, parsed) => parsed(undefined)
//   );
// }
//
// /**
//  * Debug/tests only
//  */
// async getResourceDump(rID: $Resource | bigint, fieldNames?: string[], _acc?: {
//   resourceIds: unknown[]
// }): Promise<Record<string, unknown>> {
//   const res = await this.getResource(rID);
//   const attrs: Record<string, unknown> = {};
//   const _fields = fieldNames ? res.fields.filter(field => fieldNames.includes(field.id.fieldName)) : res.fields;
//
//   const isRoot = !_acc;
//
//   const acc = _acc ?? {
//     resourceIds: [res.id]
//   };
//
//   await Promise.all(_fields.map(field => {
//     return this.getFieldDump(field, acc).then(res => attrs[field.id.fieldName] = res ?? null);
//   }));
//
//   if (isRoot) {
//     attrs['@resourceIds'] = uniqueFrom(acc.resourceIds, id => id).filter(it => it).sort();
//   }
//
//   return attrs;
// }
//
// async getFieldDump(fieldOrRef: Field | $Field, acc: { resourceIds: unknown[] }): Promise<{
//   resourceId: unknown,
//   resourceType: unknown
// }> {
//   const field = await this.#resolveField(fieldOrRef);
//
//   const dump = {
//     resourceId: undefined as unknown | undefined,
//     resourceType: undefined as unknown | undefined,
//     field: `type: ${getFieldTypeLabel(field.type)} value: ${field.value} error: ${field.error}`,
//     error: undefined as string | undefined,
//     value: undefined as unknown,
//     fields: undefined as unknown
//   };
//
//   if (field.error) {
//     const err = await this.getResource(field.error, false);
//     dump.error = 'Field: ' + field.id?.fieldName + ': ' + errToString(err);
//   }
//
//   if (field.value) {
//     const resource = await this.getResource(field.value || field.error, true);
//
//     const { type, kind } = resource;
//
//     if (!type) {
//       throw Error('Empty resource type');
//     }
//
//     dump.resourceId = resource.id;
//
//     dump.resourceType = `${type.name}@${type.version}`;
//
//     if (kind === Resource_Kind.STRUCTURAL) {
//       dump.fields = await this.getResourceDump($Resource.from(this.ctx, resource), undefined, acc);
//       dump.value = Buffer.from(resource.data).toString();
//     } else {
//       dump.value = deserializeValue(resource);
//     }
//   }
//
//   acc.resourceIds.push(dump.resourceId);
//
//   return dump;
// }
//
// public getReport() {
//   return ['tx', this.writable ? 'w' : 'r', this.name, ...this.reports, this.dt(), 'ms'].join(' ');
// }
}
