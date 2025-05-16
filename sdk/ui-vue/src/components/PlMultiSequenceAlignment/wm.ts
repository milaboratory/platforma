import type { AlignmentRow, SequenceRow } from './types';
import Worker from './worker?worker';

export type Message<D = unknown> = { id: number; data: D; error: unknown };

export class WorkerManager {
  private nextMessageId = 0;
  private worker: Worker;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();

  constructor() {
    const worker = this.worker = new Worker();

    worker.onmessage = (event: MessageEvent<Message>) => {
      const { id, data, error } = event.data;

      const { resolve, reject } = this.pendingRequests.get(id)!;
      this.pendingRequests.delete(id);
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } else {
        resolve(data);
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('Worker error', event);
      this.rejectAllPendingRequests(event);
    };
  }

  private rejectAllPendingRequests(msg: unknown) {
    Array.from(this.pendingRequests.values()).map(({ reject }) => {
      reject(msg);
    });
  }

  async align(data: { sequenceRows: SequenceRow[] }): Promise<{ result: AlignmentRow[] }> {
    return new Promise<{ result: AlignmentRow[] }>((resolve, reject) => {
      const id = ++this.nextMessageId;
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, data });
    });
  }

  async terminate() {
    this.rejectAllPendingRequests(new Error('Worker terminated'));
    this.worker.terminate();
  }
}
