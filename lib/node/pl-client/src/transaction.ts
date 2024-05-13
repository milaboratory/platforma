import { TxAPI_ClientMessage, TxAPI_ServerMessage } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { DuplexStreamingCall } from '@protobuf-ts/runtime-rpc';
import * as stream from 'node:stream';
import Denque from 'denque';

// export type ClientMessageRequest = TxAPI_ClientMessage['request'];
//
// export type ServerMessageResponse = TxAPI_ServerMessage['response'];
//
// type TxStream = DuplexStreamingCall<TxAPI_ClientMessage, TxAPI_ServerMessage>;
//
// export type OneOfKind<T extends { oneofKind: unknown }, K extends T['oneofKind']> = Extract<T, { oneofKind: K }>;
//
// type ResponseParser<T, K extends ServerMessageResponse['oneofKind']> =
//   (msg: OneOfKind<ServerMessageResponse, K>) => T;
//
// interface ResponseHandler<Kind extends ClientMessageRequest['oneofKind']> {
//   kind: Kind;
//   resolve: (v: OneOfKind<ServerMessageResponse, Kind>) => void;
//   reject: (e: Error) => void;
//   response: Promise<T>;
// }
//
// function createResponseHandler<T, K extends ClientMessageRequest['oneofKind']>(kind: K,
// parser: ResponseParser<T, K>,
// resolve: (v: T) => void,
// reject: (e: Error) => void,
// response: Promise<T>){
//   return {kind, parser, response, }
// }
//

/**
 * Each platform transaction has 3 stages:
 *   - initialization (txOpen message -> txInfo response)
 *   - communication (create resources, fields, references and so on)
 *   - finalization (txCommit or txDiscard message)
 *
 * This class encapsulates finalization stage and provides ready-to-communication transaction object.
 * */
export class PlTransaction {
  /** Counter of sent requests, used to calculate which future response will correspond to this request.
   * Incremented on each sent request. */
  private requestIdxCounter = 0;

  // /** Handler map, stores response handlers until corresponding replies are received by the client. */
  // private readonly responseHandlers: Map<number, ResponseHandler<unknown, ServerMessageResponse['oneofKind']>> = new Map();

  private readonly responseHandlers = new Denque<ResponseHandler<unknown, ServerMessageResponse['oneofKind']>>();

  /** Each new resource, created by the transaction, is assigned with virtual (local) resource id, to make it possible
   * to populate its fields without awaiting actual resource id. This counter tracks those ids on client side, the
   * same way it is tracked on the server, so client can synchronously return such ids to the user. */
  private localResourceIdCounter = 0n;

  /** Switches to true, when this transaction closes due to normal or exceptional conditions. */
  private completed = false;

  /** Global transaction ID obtained from Pl during transaction initialization. */
  public readonly globalTxId: Promise<bigint>;

  /** Internal transaction id. This id is always attached to local (virtual) resource ids returned by this instance. */
  private readonly internalTxId: number;
  private static readonly internalTxIdCounter: number = 1;

  /** If this transaction was terminated due to error, this field is assigned with it. */
  private _error?: unknown;

  /** Timestamp when transaction was opened */
  private readonly openTimestamp = Date.now();

  private readonly incomingProcessorResult: Promise<void>;

  // constructor(
  //   public readonly stream: TxStream,
  //   public readonly writable: boolean,
  //   public readonly name: string
  // ) {
  //
  //   // Starting incoming event processor
  //   this.incomingProcessorResult = this.incomingEventProcessor();
  //
  //
  //   this.globalTxId = this.open(name, writable); // pass 'initialization' stage
  //   this.internalTxId = _nextTxInternalID++;
  // }
  //
  // private async incomingEventProcessor(): Promise<void> {
  //   /** Counter of received responses, used to check consistency of responses.
  //    * Increments on each received message. */
  //   let responseIdxCounter = 0;
  //
  //   try {
  //     for await (const message of this.stream.responses) {
  //       message.
  //     }
  //   } catch (e: unknown) {
  //
  //   }
  // }
  //
  // /** Generate proper client message and send it to the server, attaching
  //  // 'parse' callback that will be able to parse server response when it arrives to client. */
  // private async send<T, K extends ClientMessageRequest['oneofKind']>(
  //   r: OneOfKind<ClientMessageRequest, K>,
  //   p: ResponseParser<T, K>
  // ): Promise<{ response: Promise<T> }> {
  //   const request = {
  //     requestId: this.requestIdxCounter++,
  //     request: r
  //   };
  //
  //   // Promise synchronously executes a callback passed to a constructor
  //   const result = new Promise<T>((resolve, reject) => {
  //     this.responseHandlers.push({ parser });
  //   });
  //
  //   this.responseHandlers.set(requestID, {
  //     parser: parser as unknown as ResponseParser<T, ServerMessageResponse['oneofKind']>,
  //     resolve: deferred.resolve as ((v: unknown) => void),
  //     reject: deferred.reject,
  //     response: deferred.promise,
  //     kind
  //   });
  //
  //   return deferred;
  //
  //   const deferred = this.asyncResponse<T, K>(request.requestId, p, r.oneofKind);
  //
  //   await Promise.race([this.tx.requests.send(request), deferred.promise]);
  //
  //   return {
  //     response: deferred.promise
  //   };
  // }

  // async allRequestSettled() {
  //   const results = await Promise.allSettled(
  //     mapIterable(this.responseHandlers.values(), h => {
  //       return h.response;
  //     })
  //   );
  //
  //   if (results.some(r => r.status === 'rejected')) {
  //     throw Error(results.filter(r => r.status === 'rejected').map(r => String('reason' in r ? r.reason : '')).join('\n'));
  //   }
  // }
  //
  // shouldSync() {
  //   this.shouldSyncFlag = true;
  //   return this;
  // }
  //
  // async complete() {
  //   if (!this.completed) {
  //     const all = this.ctx.txState.all;
  //     const info = (all[this.name] ?? { count: 0, dt: 0 });
  //     info.count++;
  //     info.dt = info.dt + this.dt();
  //     all[this.name] = info;
  //     this.completed = true;
  //     await this.tx.requests.complete();
  //   }
  //   if (this.writable) {
  //     await this.tx;
  //   }
  // }
  //
  // rejectAll(err: Error) {
  //   [...this.responseHandlers.values()].forEach(h => {
  //     h.reject(err);
  //   });
  // }
  //
  // get pl() {
  //   return this.client.pl;
  // }
  //
  // get ctx() {
  //   return this.client.ctx;
  // }
  //
  // get logger() {
  //   return this.client.ctx.logger;
  // }
  //
  // get isSynchronized() {
  //   return this.#isSynchronized;
  // }
  //
  // // Provides sequential local resource IDs generation for requests that
  // // create new resources.
  // #nextResourceID(root: boolean): bigint {
  //   let rID = ++this.localResourceIdCounter;
  //
  //   if (root) {
  //     rID = rID | m.rootResourceIDMask;
  //   }
  //
  //   return rID | m.localResourceIDMask;
  // }
  //
  // #nextResourceLocalID(): bigint {
  //   return this.#nextResourceID(false);
  // }
  //
  // #nextResourceRootId(): bigint {
  //   return this.#nextResourceID(true);
  // }
  //
  // // Handles all incoming server messages in transaction,
  // // resolving appropriate client requests with data, received from server.
  // // Each request message (from client to server) has its own requestID unique for
  // // transaction.
  // // Each response message (from server to client) has its 'requestID' field set to the
  // // ID of request, this response is done for.
  // private handleResponse(
  //   msg: TxAPI_ServerMessage | undefined,
  //   error: Error | undefined,
  //   complete: boolean
  // ): void {
  //   if (complete) {
  //     return;
  //   }
  //
  //   this.responseIdxCounter++; // We already have a [msg.requestId], why do we need nextResponseID?
  //
  //   if (error) {
  //     const h = this.responseHandlers.get(this.responseIdxCounter); // @todo
  //
  //     if (h) {
  //       this.client.logger.warn('REJECT Tx kind: ' + h.kind);
  //       if (h.kind === 'txOpen') {
  //         return this.rejectAll(error);
  //       }
  //       return h.reject(error);
  //     }
  //
  //     return this.rejectAll(error);
  //   }
  //
  //   if (!msg) {
  //     return this.rejectAll(Error('communication error: undefined message for non-error response'));
  //   }
  //
  //   const { requestId } = msg;
  //
  //   const handler = this.responseHandlers.get(requestId);
  //
  //   if (handler === undefined) {
  //     return this.rejectAll(Error('communication error: request promise not found by requestID'));
  //   }
  //
  //   if (msg.requestId !== this.responseIdxCounter) {
  //     return this.rejectAll(
  //       Error(`communication error: expected response with ID '${this.responseIdxCounter}', got '${msg.requestId}'`)
  //     );
  //   }
  //
  //   if (msg.error) {
  //     return handler.reject(StatusError.from(msg.error));
  //   }
  //
  //   if (msg.response.oneofKind !== handler.kind) {
  //     return handler.reject(Error(`wrong server response on '${handler.kind}' request: '${vd(msg)}'`));
  //   }
  //
  //   return handler.parser(msg.response, handler.resolve, handler.reject);
  // }
  //
  // // Generates client request message with its own unique ID, that can be used
  // // for server response identification in server messages stream.
  // private request(r: ClientMessageRequest): TxAPI_ClientMessage {
  //   this.requestIdxCounter++;
  //   return {
  //     requestId: this.requestIdxCounter,
  //     request: r
  //   };
  // }
  //
  // // Creates async response, that will be resolved once server sends a response to
  // // the request.
  // private asyncResponse<T, K extends ServerMessageResponse['oneofKind']>(
  //   requestID: number,
  //   parser: ResponseParser<T, K>,
  //   kind: string | undefined
  // ): Deferred<T> {
  //   const deferred = new Deferred<T>();
  //
  //   this.responseHandlers.set(requestID, {
  //     parser: parser as unknown as ResponseParser<T, ServerMessageResponse['oneofKind']>,
  //     resolve: deferred.resolve as ((v: unknown) => void),
  //     reject: deferred.reject,
  //     response: deferred.promise,
  //     kind
  //   });
  //
  //   return deferred;
  // }
  //
  //
  // // Open transaction. This message is required to be the first in transaction stream
  // // and makes transaction stream to proceed from 'initialization' to 'communication' stage.
  // private async open(name: string, writable: boolean): Promise<bigint> {
  //   return unfold(this.send<bigint, 'txOpen'>(
  //     m.txOpen(name, writable),
  //     (msg, parsed, failed) => {
  //       if (msg.txOpen.tx === undefined) {
  //         return failed(Error('server returned no transaction info'));
  //       }
  //       parsed(msg.txOpen.tx.id);
  //     }
  //   ));
  // }
  //
  // // commit transaction and close transaction stream.
  // protected async commit(): Promise<void> {
  //   if (!this.writable) {
  //     await this.complete();
  //     return;
  //   }
  //
  //   const response = this.send<boolean, 'txCommit'>(
  //     m.txCommit(),
  //     (msg, parsed) => {
  //       parsed(msg.txCommit.success);
  //     }
  //   );
  //
  //   await this.allRequestSettled();
  //
  //   const done = await unfold(response);
  //
  //   if (!done) {
  //     throw new FailedToCommitError('failed to commit transaction');
  //   }
  //
  //   this.reports.push('commited');
  //
  //   await this.complete();
  // }
  //
  // public async commitAndMaybeSync() {
  //   try {
  //     await this.commit();
  //     if (this.shouldSyncFlag) {
  //       await this.sync();
  //     }
  //   } catch (e) {
  //     await this.complete();
  //     throw e;
  //   } finally {
  //     this.client.ctx.txState.count--;
  //   }
  // }
  //
  // // discard transaction changes and close the stream
  // public async discard(): Promise<void> {
  //   const response = this.send<void, 'txDiscard'>(
  //     m.txDiscard(),
  //     (msg, parsed) => {
  //       parsed();
  //     }
  //   );
  //
  //   await unfold(response);
  //
  //   await this.complete();
  // }
  //
  // public async sync(): Promise<void> {
  //   await this.pl.txSync(m.txSync(await this.globalTxId));
  //   this.#isSynchronized = true;
  //   this.reports.push('synchronized');
  // }
  //
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
