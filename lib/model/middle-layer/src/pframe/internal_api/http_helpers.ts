import type { Readable } from 'node:stream';
import type { RequestListener } from 'node:http';
import type { Branded } from '@milaboratories/pl-model-common';
import { SecureContextOptions } from 'node:tls';

/** File range specification */
export type FileRange = {
  /** Start byte position (inclusive) */
  start: number;
  /** End byte position (inclusive) */
  end: number;
};

/**
 * File system abstraction for request handler factory,
 * @see HttpHelpers.createRequestHandler.
 * Assumes that it is working with flat directory structure.
 * Accepts filenames with extension as input (e.g. `file.parquet`).
 */
export interface ObjectStore {
  /**
   * Get file size, rejects if file does not exist.
   *
   * @example
   * ```ts
   * async getFileSize(filename: string): Promise<number> {
   *   const filePath = this.resolve(filename);
   *   try {
   *     const { size } = await fs.stat(filePath);
   *     return { size };
   *   } catch (err: unknown) {
   *     throw new Error(
   *       `Failed to get file statistics for: ${filename} - ${ensureError(err)}`
   *     );
   *   }
   * }
   * ```
   */
  getFileSize(filename: string): Promise<number>;

  /**
   * Execute action with readable stream.
   * Action resolves when stream is closed eigher by handler
   * @see HttpHelpers.createRequestHandler or the store itself.
   * Returned promise resolves after the action is completed.
   *
   * @example
   * ```ts
   * async withReadStream(params: {
   *   filename: string;
   *   range?: FileRange;
   *   action: (stream: Readable) => Promise<void>;
   * }): Promise<void> {
   *   const { filename, range, action } = params;
   *   const filePath = this.resolve(filename);
   *
   *   let stream: Readable;
   *   try {
   *     stream = createReadStream(filePath, range);
   *   } catch (err: unknown) {
   *     throw new Error(
   *       `Failed to create read stream for: ${filename} - ${ensureError(err)}`
   *     );
   *   }
   *
   *   return await action(stream);
   * }
   * ```
   */
  withReadStream(params: {
    filename: string;
    action: (stream: Readable) => Promise<void>;
    range?: FileRange;
  }): Promise<void>;
}

/** Object store base URL in format accepted by Apache DataFusion and DuckDB */
export type ObjectStoreUrl = Branded<string, 'PFrameInternal.ObjectStoreUrl'>;

/** TLS options for HTTP server */
export type TlsOptions = Required<Pick<SecureContextOptions, 'cert' | 'key'>> &
  Pick<SecureContextOptions, 'ca'>; // set `ca` for self-signed certificates

/** Server configuration options */
export type HttpServerOptions = {
  /** HTTP request handler function */
  handler: RequestListener;
  /** Host to bind to (defaults to '127.0.0.1') */
  host?: string;
  /** Port to bind to (defaults to 0 for auto-assignment) */
  port?: number;
  /** TLS options, when provided will start HTTPS server instead of HTTP */
  tls?: TlsOptions;
};

/** Result of the server start operation */
export interface HttpServer {
  /** Server address info in format accepted by Apache DataFusion and DuckDB */
  get address(): ObjectStoreUrl;
  /** Promise that resolves when the server is stopped */
  get stopped(): Promise<void>;
  /** Request server stop, returns the same promise as @see HttpServer.stopped */
  stop(): Promise<void>;
}

export interface HttpHelpers {
  /**
   * Create an object store for serving files from a local directory.
   * Rejects if the provided path does not exist or is not a directory.
   * Intended for testing purposes, you will probably want to implement a different store.
   */
  createFsStore(rootDir: string): Promise<ObjectStore>;

  /**
   * Create an HTTP request handler for serving files from an object store.
   * Accepts only paths of the form `/<filename>.parquet`, returns 404 otherwise.
   * Assumes that files are immutable (and sets cache headers accordingly).
   * Enforces authentication using Bearer scheme if @param authToken is provided.
   */
  createRequestHandler(store: ObjectStore, authToken?: string): RequestListener;

  /**
   * Serve HTTP requests using the provided handler on the given host and port.
   * Returns a promise that resolves when the server is stopped.
   *
   * @example
   * ```ts
   * const rootDir = '/path/to/directory/with/parquet/files';
   * const authToken = randomUUID();
   * const port = 3000;
   *
   * let store = await HttpHelpers.createFsStore(rootDir).catch((err: unknown) => {
   *   throw new Error(`Failed to create file store for ${rootDir} - ${ensureError(err)}`);
   * });
   *
   * const server = await HttpHelpers.createHttpServer({
   *   handler: HttpHelpers.createRequestHandler(store, authToken),
   *   port,
   * }).catch((err: unknown) => {
   *   throw new Error(`Failed to start http server on port ${port} - ${ensureError(err)}`);
   * });
   *
   * const _ = server.address;
   *
   * await server.stop();
   * ```
   */
  createHttpServer(options: HttpServerOptions): Promise<HttpServer>;
}
