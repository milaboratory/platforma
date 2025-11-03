import * as net from 'node:net';
import type { AddressInfo } from 'node:net';
import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as timers from 'node:timers/promises';

export type TcpProxyOptions = {
  port?: number;
  targetPort: number;
  latency: number;
  verbose?: boolean;
};

export async function startTcpProxy(options: TcpProxyOptions) {
  const { port, targetPort } = options;

  const state = {
    latency: options.latency,
  };

  const setLatency = (latency: number) => {
    state.latency = latency;
  };

  const getLatency = () => {
    return state.latency;
  };

  const connections = new Set<{ socket: net.Socket; client: net.Socket }>();

  async function disconnectAll() {
    console.log('>>>>> DISConnect ALL');
    const kill = () => {
      for (const { socket, client } of connections) {
        if (!socket.destroyed) socket.destroy();
        if (!client.destroyed) client.destroy();
      }
      connections.clear();
    };
    await timers.setTimeout(1);
    kill();
  };

  const server = net
    .createServer((socket: net.Socket) => {
      const client = net.createConnection({ port: targetPort }, () => {
        if (options.verbose) console.log(`connected to ${targetPort}`);
      });

      const pair = { socket, client };
      connections.add(pair);
      const onClose = () => connections.delete(pair);
      socket.on('close', onClose);
      client.on('close', onClose);

      class LatencyTransform extends Transform {
        private pendingTimer?: NodeJS.Timeout;
        constructor() {
          super();
        }

        _transform(chunk: Buffer, _enc: BufferEncoding, callback: TransformCallback) {
          // Backpressure is respected by delaying the callback until after push
          this.pendingTimer = setTimeout(() => {
            this.pendingTimer = undefined;
            this.push(chunk);
            callback();
          }, state.latency);
        }

        _destroy(err: Error | null, cb: (error?: Error | null) => void) {
          if (this.pendingTimer) clearTimeout(this.pendingTimer);
          this.pendingTimer = undefined;
          cb(err);
        }
      }

      const toClientLatency = new LatencyTransform();
      const toTargetLatency = new LatencyTransform();

      // Bidirectional pipelines with latency and error propagation
      pipeline(socket, toTargetLatency, client).catch((err) => {
        socket.destroy(err);
        client.destroy(err);
      });

      pipeline(client, toClientLatency, socket).catch((err) => {
        socket.destroy(err);
        client.destroy(err);
      });
    });

  server.listen({ port: port ?? 0 }, () => {
    console.log('opened server on', server.address());
  });

  // Wait for proxy to be ready
  await new Promise<void>((resolve, reject) => {
    if (server.listening) return resolve();
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
  });

  return {
    server,
    get port() { return (server.address() as AddressInfo)?.port; },
    setLatency,
    getLatency,
    disconnectAll,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

export type TestTcpProxy = Awaited<ReturnType<typeof startTcpProxy>>;
