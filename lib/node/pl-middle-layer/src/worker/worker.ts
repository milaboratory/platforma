import { parentPort } from 'node:worker_threads';
import { workerApi, type Scheme } from './workerApi';

if (!parentPort) {
  throw new Error('Parent port is not available');
}

parentPort.on('message', ({ id, type, args }: { id: number; type: unknown; args: unknown[] }) => {
  (workerApi[type as keyof Scheme] as (...args: unknown[]) => Promise<unknown>)(...args).then((r) => {
    parentPort?.postMessage({ id, data: r });
  }).catch((e) => {
    parentPort?.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  });
});
