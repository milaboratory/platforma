import { AuthOps, PlClientConfig, PlConnectionStatusListener } from './config';
import { LLPlClient, PlCallOps } from './ll_client';
import { AnyResourceRef, PlTransaction, toGlobalResourceId, TxCommitConflict } from './transaction';
import { createHash } from 'crypto';
import {
  ensureResourceIdNotNull,
  isNullResourceId,
  NullResourceId,
  OptionalResourceId,
  ResourceId
} from './types';
import { ClientRoot } from '../helpers/pl';
import {
  assertNever,
  createRetryState,
  nextRetryStateOrError,
  RetryOptions
} from '@milaboratories/ts-helpers';
import { PlDriver, PlDriverDefinition } from './driver';
import { MaintenanceAPI_Ping_Response } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import * as tp from 'node:timers/promises';
import { Dispatcher } from 'undici';

export type TxOps = PlCallOps & {
  sync?: boolean;
  retryOptions?: RetryOptions;
};

const defaultTxOps = {
  sync: false
};

const AnonymousClientRoot = 'AnonymousRoot';

function alternativeRootFieldName(alternativeRoot: string): string {
  return `alternative_root_${alternativeRoot}`;
}

/** Client to access core PL API. */
export class PlClient {
  private readonly ll: LLPlClient;
  private readonly drivers = new Map<String, PlDriver>();

  /** Artificial delay introduced after write transactions completion, to
   * somewhat throttle the load on pl. Delay introduced after sync, if requested. */
  private readonly txDelay: number;

  /** Last resort measure to solve complicated race conditions in pl. */
  private readonly forceSync: boolean;

  /** Last resort measure to solve complicated race conditions in pl. */
  private readonly defaultRetryOptions: RetryOptions;

  /** Stores client root (this abstraction is intended for future implementation of the security model)*/
  private _clientRoot: OptionalResourceId = NullResourceId;

  private _serverInfo: MaintenanceAPI_Ping_Response | undefined = undefined;

  private constructor(
    configOrAddress: PlClientConfig | string,
    auth: AuthOps,
    ops: {
      statusListener?: PlConnectionStatusListener;
    } = {}
  ) {
    this.ll = new LLPlClient(configOrAddress, { auth, ...ops });
    const conf = this.ll.conf;
    this.txDelay = conf.txDelay;
    this.forceSync = conf.forceSync;
    switch (conf.retryBackoffAlgorithm) {
      case 'exponential':
        this.defaultRetryOptions = {
          type: 'exponentialBackoff',
          initialDelay: conf.retryInitialDelay,
          maxAttempts: conf.retryMaxAttempts,
          backoffMultiplier: conf.retryExponentialBackoffMultiplier,
          jitter: conf.retryJitter
        };
        break;
      case 'linear':
        this.defaultRetryOptions = {
          type: 'linearBackoff',
          initialDelay: conf.retryInitialDelay,
          maxAttempts: conf.retryMaxAttempts,
          backoffStep: conf.retryLinearBackoffStep,
          jitter: conf.retryJitter
        };
        break;
      default:
        assertNever(conf.retryBackoffAlgorithm);
    }
  }

  public async ping(): Promise<MaintenanceAPI_Ping_Response> {
    return (await this.ll.grpcPl.ping({})).response;
  }

  public get conf(): PlClientConfig {
    return this.ll.conf;
  }

  public get httpDispatcher(): Dispatcher {
    return this.ll.httpDispatcher;
  }

  private get initialized() {
    return !isNullResourceId(this._clientRoot);
  }

  private checkInitialized() {
    if (!this.initialized) throw new Error('Client not initialized');
  }

  public get clientRoot(): ResourceId {
    this.checkInitialized();
    return ensureResourceIdNotNull(this._clientRoot);
  }

  public get serverInfo(): MaintenanceAPI_Ping_Response {
    this.checkInitialized();
    return this._serverInfo!;
  }

  /** Currently implements custom logic to emulate future behaviour with single root. */
  public async init() {
    if (this.initialized) throw new Error('Already initialized');

    // calculating reproducible root name from the username
    const user = this.ll.authUser;
    const mainRootName =
      user === null ? AnonymousClientRoot : createHash('sha256').update(user).digest('hex');

    this._serverInfo = await this.ping();

    this._clientRoot = await this._withTx('initialization', true, NullResourceId, async (tx) => {
      let mainRoot: AnyResourceRef;

      if (await tx.checkResourceNameExists(mainRootName))
        mainRoot = await tx.getResourceByName(mainRootName);
      else {
        mainRoot = tx.createRoot(ClientRoot);
        tx.setResourceName(mainRootName, mainRoot);
      }

      if (this.conf.alternativeRoot === undefined) {
        await tx.commit();
        return await toGlobalResourceId(mainRoot);
      } else {
        const aFId = {
          resourceId: mainRoot,
          fieldName: alternativeRootFieldName(this.conf.alternativeRoot)
        };

        const altRoot = tx.createEphemeral(ClientRoot);
        tx.lock(altRoot);
        tx.createField(aFId, 'Dynamic');
        tx.setField(aFId, altRoot);
        await tx.commit();

        return await altRoot.globalId;
      }
    });

    // try {
    //
    // } catch (error: unknown) {
    //   if(isUnauthenticated(error) && this.)
    // }
  }

  /** Returns true if field existed */
  public async deleteAlternativeRoot(alternativeRootName: string): Promise<boolean> {
    this.checkInitialized();
    if (this.ll.conf.alternativeRoot !== undefined)
      throw new Error('Initialized with alternative root.');
    return await this.withWriteTx('delete-alternative-root', async (tx) => {
      const fId = {
        resourceId: tx.clientRoot,
        fieldName: alternativeRootFieldName(alternativeRootName)
      };
      const exists = tx.fieldExists(fId);
      tx.removeField(fId);
      await tx.commit();
      return await exists;
    });
  }

  private async _withTx<T>(
    name: string,
    writable: boolean,
    clientRoot: OptionalResourceId,
    body: (tx: PlTransaction) => Promise<T>,
    ops?: TxOps
  ): Promise<T> {
    // for exponential / linear backoff
    let retryState = createRetryState(ops?.retryOptions ?? this.defaultRetryOptions);

    while (true) {
      // opening low-level tx
      const llTx = this.ll.createTx(ops);
      // wrapping it into high-level tx (this also asynchronously sends initialization message)
      const tx = new PlTransaction(llTx, name, writable, clientRoot);

      let ok = false;
      let result: T | undefined = undefined;
      let txId;

      try {
        // executing transaction body
        result = await body(tx);
        ok = true;
      } catch (e: unknown) {
        // the only recoverable
        if (e instanceof TxCommitConflict) {
          // ignoring
          // TODO collect stats
        } else {
          throw e;
        }
      } finally {
        // close underlying grpc stream, if not yet done

        // even though we can skip two lines below for read-only transactions,
        // we don't do it to simplify reasoning about what is going on in
        // concurrent code, especially in significant latency situations
        await tx.complete();
        await tx.await();

        txId = await tx.getGlobalTxId();
      }

      if (ok) {
        // syncing on transaction if requested
        if (ops?.sync === undefined ? this.forceSync : ops?.sync)
          await this.ll.grpcPl.txSync({ txId });

        // introducing artificial delay, if requested
        if (writable && this.txDelay > 0)
          await tp.setTimeout(this.txDelay, undefined, { signal: ops?.abortSignal });

        return result!;
      }

      // we only get here after TxCommitConflict error,
      // all other errors terminate this loop instantly

      await tp.setTimeout(retryState.nextDelay, undefined, { signal: ops?.abortSignal });
      retryState = nextRetryStateOrError(retryState);
    }
  }

  private async withTx<T>(
    name: string,
    writable: boolean,
    body: (tx: PlTransaction) => Promise<T>,
    ops: Partial<TxOps> = {}
  ): Promise<T> {
    this.checkInitialized();
    return await this._withTx(name, writable, this.clientRoot, body, { ...ops, ...defaultTxOps });
  }

  public async withWriteTx<T>(
    name: string,
    body: (tx: PlTransaction) => Promise<T>,
    ops: Partial<TxOps> = {}
  ): Promise<T> {
    return await this.withTx(name, true, body, { ...ops, ...defaultTxOps });
  }

  public async withReadTx<T>(
    name: string,
    body: (tx: PlTransaction) => Promise<T>,
    ops: Partial<TxOps> = {}
  ): Promise<T> {
    return await this.withTx(name, false, body, { ...ops, ...defaultTxOps });
  }

  public getDriver<Drv extends PlDriver>(definition: PlDriverDefinition<Drv>): Drv {
    const attached = this.drivers.get(definition.name);
    if (attached !== undefined) return attached as Drv;
    const driver = definition.init(this, this.ll.grpcTransport, this.ll.httpDispatcher);
    this.drivers.set(definition.name, driver);
    return driver;
  }

  /** Closes underlying transport */
  public close() {
    this.ll.close();
  }

  public static async init(
    configOrAddress: PlClientConfig | string,
    auth: AuthOps,
    ops: {
      statusListener?: PlConnectionStatusListener;
    } = {}
  ) {
    const pl = new PlClient(configOrAddress, auth, ops);
    await pl.init();
    return pl;
  }
}