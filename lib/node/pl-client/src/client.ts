import { AuthOps, PlConnectionConfig } from './config';
import { LLPlClient, PlCallOps, PlConnectionStatusListener } from './ll_client';
import { PlTransaction, TxCommitConflict } from './transaction';
import { sleep } from './util/temporal';
import { createHash } from 'crypto';
import { isNullResourceId, NullResourceId, OptionalResourceId, ResourceId } from './types';
import { ClientRoot } from './resource_types';

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

/** Client to access core PL API. */
export class PlClient {
  private readonly ll: LLPlClient;

  /** Stores client root (this abstraction is intended for future implementation of the security model)*/
  private clientRoot: OptionalResourceId = NullResourceId;

  constructor(configOrAddress: PlConnectionConfig | string,
              auth: AuthOps,
              ops: {
                statusListener?: PlConnectionStatusListener
              } = {}) {
    this.ll = new LLPlClient(configOrAddress, { auth, ...ops });
  }

  public get initialized() {
    return !isNullResourceId(this.clientRoot);
  }

  /** Currently implements custom logic to emulate future behaviour with single root. */
  public async init() {
    if (this.initialized)
      throw new Error('Already initialized');

    // calculating reproducible root name from the username
    const user = this.ll.authUser;
    const clientRootName = user === null
      ? AnonymousClientRoot
      : createHash('sha256').update(user).digest('hex');

    this.clientRoot = await this.withWriteTx('initialization', async tx => {
      if (await tx.checkResourceNameExists(clientRootName))
        return await tx.getResourceByName(clientRootName);
      else {
        const newRoot = tx.createRoot(ClientRoot);
        await Promise.all([
          tx.setResourceName(clientRootName, newRoot),
          tx.commit()
        ]);
        return await newRoot.globalId;
      }
    });
  }

  // TODO maybe it is better to create a common timeout abort signal here
  //      to make execution time more predictable, or maybe it makes more
  //      sense to keep it as it is now...
  public async withTx<T>(name: string, writable: boolean,
                         body: (tx: PlTransaction) => Promise<T>,
                         ops: TxOps = defaultTxOps): Promise<T> {
    // for exponential backoff
    let nextDelay = ops.initialRetryDelay;

    for (let i = 0; i < ops.maxAttempts; ++i) {

      // opening low-level tx
      const llTx = this.ll.createTx(ops);
      // wrapping it into high-level tx (this also asynchronously sends initialization message)
      const tx = new PlTransaction(llTx, name, writable);

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

  public withWriteTx<T>(name: string,
                        body: (tx: PlTransaction) => Promise<T>,
                        ops: TxOps = defaultTxOps): Promise<T> {
    return this.withTx(name, true, body, ops);
  }

  public withReadTx<T>(name: string,
                       body: (tx: PlTransaction) => Promise<T>,
                       ops: TxOps = defaultTxOps): Promise<T> {
    return this.withTx(name, false, body, ops);
  }

  /** Closes underlying transport */
  public close() {
    this.ll.close();
  }
}
