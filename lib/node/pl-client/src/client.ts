import { AuthOps, PlClientConfig, PlConnectionStatusListener } from './config';
import { LLPlClient, PlCallOps } from './ll_client';
import { AnyResourceRef, PlTransaction, toGlobalResourceId, TxCommitConflict } from './transaction';
import { createHash } from 'crypto';
import { ensureResourceIdNotNull, isNullResourceId, NullResourceId, OptionalResourceId, ResourceId } from './types';
import { ClientRoot } from './resource_types';
import { sleep } from '@milaboratory/ts-helpers';
import { PlDriver, PlDriverDefinition } from './driver';

export type TxOps = PlCallOps & {
  sync: boolean,
  maxAttempts: number,
  initialRetryDelay: number,
  backoffMultiplier: number,
  jitter: number,
}

const defaultTxOps: TxOps = {
  sync: false,
  maxAttempts: 9, // final backoff 2ms * 2 ^ 8 ~ 500ms (total time ~1s)
  initialRetryDelay: 2, // 2ms
  backoffMultiplier: 2, // + 100% on each round
  jitter: 0.1 // 10%
};

const AnonymousClientRoot = 'AnonymousRoot';

function alternativeRootFieldName(alternativeRoot: string): string {
  return `alternative_root_${alternativeRoot}`;
}

/** Client to access core PL API. */
export class PlClient {
  private readonly ll: LLPlClient;
  private readonly drivers = new Map<String, PlDriver>();

  /** Stores client root (this abstraction is intended for future implementation of the security model)*/
  private _clientRoot: OptionalResourceId = NullResourceId;

  constructor(configOrAddress: PlClientConfig | string,
              auth: AuthOps,
              ops: {
                statusListener?: PlConnectionStatusListener
              } = {}) {
    this.ll = new LLPlClient(configOrAddress, { auth, ...ops });
  }

  public get conf(): PlClientConfig {
    return this.ll.conf;
  }

  public get initialized() {
    return !isNullResourceId(this._clientRoot);
  }

  private checkInitialized() {
    if (!this.initialized)
      throw new Error('Client not initialized');
  }

  public get clientRoot(): ResourceId {
    this.checkInitialized();
    return ensureResourceIdNotNull(this._clientRoot);
  }

  /** Currently implements custom logic to emulate future behaviour with single root. */
  public async init() {
    if (this.initialized)
      throw new Error('Already initialized');

    // calculating reproducible root name from the username
    const user = this.ll.authUser;
    const mainRootName = user === null
      ? AnonymousClientRoot
      : createHash('sha256').update(user).digest('hex');

    this._clientRoot = await this._withTx('initialization', true, NullResourceId,
      async tx => {
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
          const aFId = { resourceId: mainRoot, fieldName: alternativeRootFieldName(this.conf.alternativeRoot) };

          const altRoot = tx.createEphemeral(ClientRoot);
          tx.lock(altRoot);
          tx.createField(aFId, 'Dynamic');
          tx.setField(aFId, altRoot);
          await tx.commit();

          return await altRoot.globalId;
        }
      });
  }

  /** Returns true if field existed */
  public async deleteAlternativeRoot(alternativeRootName: string): Promise<boolean> {
    this.checkInitialized();
    if (this.ll.conf.alternativeRoot !== undefined)
      throw new Error('Initialized with alternative root.');
    return await this.withWriteTx('delete-alternative-root', async tx => {
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

  // TODO maybe it is better to create a common timeout abort signal here
  //      to make execution time more predictable, or maybe it makes more
  //      sense to keep it as it is now...
  private async _withTx<T>(name: string, writable: boolean, clientRoot: OptionalResourceId,
                           body: (tx: PlTransaction) => Promise<T>,
                           ops: TxOps = defaultTxOps): Promise<T> {
    // for exponential backoff
    let nextDelay = ops.initialRetryDelay;

    for (let i = 0; i < ops.maxAttempts; ++i) {

      // opening low-level tx
      const llTx = this.ll.createTx(ops);
      // wrapping it into high-level tx (this also asynchronously sends initialization message)
      const tx = new PlTransaction(llTx, name, writable, clientRoot);

      try {

        // executing transaction body
        const result = await body(tx);

        // syncing on transaction if requested
        if (ops.sync) {

          // Making sure server completed current transaction
          await tx.complete();
          await tx.await();

          const txId = await tx.getGlobalTxId();
          await this.ll.grpcPl.txSync({ txId });
        }

        return result;

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
        await tx.complete(); // this should not throw recoverable errors
        await tx.await(); // this should not throw recoverable errors
      }

      await sleep(nextDelay, ops.abortSignal);

      nextDelay = nextDelay * ops.backoffMultiplier * (Math.random() - 0.5) * ops.jitter * 2;
    }

    throw new Error('Reached max number of attempts.');
  }

  private async withTx<T>(name: string, writable: boolean,
                          body: (tx: PlTransaction) => Promise<T>,
                          ops: Partial<TxOps> = {}): Promise<T> {
    this.checkInitialized();
    return this._withTx(name, writable, this.clientRoot, body, { ...ops, ...defaultTxOps });
  }

  public withWriteTx<T>(name: string,
                        body: (tx: PlTransaction) => Promise<T>,
                        ops: Partial<TxOps> = {}): Promise<T> {
    return this.withTx(name, true, body, { ...ops, ...defaultTxOps });
  }

  public withReadTx<T>(name: string,
                       body: (tx: PlTransaction) => Promise<T>,
                       ops: Partial<TxOps> = {}): Promise<T> {
    return this.withTx(name, false, body, { ...ops, ...defaultTxOps });
  }

  public getDriver<Drv extends PlDriver>(definition: PlDriverDefinition<Drv>): Drv {
    const attached = this.drivers.get(definition.name);
    if (attached !== undefined)
      return attached as Drv;
    const driver = definition.init(this, this.ll.grpcTransport, this.ll.httpDispatcher);
    this.drivers.set(definition.name, driver);
    return driver;
  }

  /** Closes underlying transport */
  public close() {
    this.ll.close();
  }
}
