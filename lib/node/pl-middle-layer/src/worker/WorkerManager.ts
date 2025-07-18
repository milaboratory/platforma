import { Worker } from 'node:worker_threads';
import type { Scheme } from './workerApi';

declare const WORKER_PATH: string;

export class WorkerManager implements AsyncDisposable {
  private nextMessageId = 0;
  private worker: Worker;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();

  constructor() {
    const worker = this.worker = new Worker(
      WORKER_PATH,
      {
        workerData: {},
      },
    );

    worker.on('message', ({ id, data, error }) => {
      const { resolve, reject } = this.pendingRequests.get(id)!;
      this.pendingRequests.delete(id);
      if (error) {
        reject(new Error(error));
      } else {
        resolve(data);
      }
    });

    worker.on('error', (msg) => {
      console.error('Worker error', msg);
      this.rejectAllPendingRequests(msg);
    });
  }

  private rejectAllPendingRequests(msg: unknown) {
    Array.from(this.pendingRequests.values()).map(({ reject }) => {
      reject(msg);
    });
  }

  async process<
    Type extends keyof Scheme,
    Args extends Scheme[Type]['args'],
    Response extends Scheme[Type]['response']>(type: Type, ...args: Args): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const id = ++this.nextMessageId;
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, type, args });
    });
  }

  async terminate() {
    this.rejectAllPendingRequests(new Error('Worker terminated'));
    await this.worker.terminate();
  }

  [Symbol.asyncDispose]() {
    return this.terminate();
  }
}
