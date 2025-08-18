import type { Readable } from 'node:stream';
import type { RequestListener } from 'node:http';
import type { Branded } from '@milaboratories/pl-model-common';

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
   * @returns file size in bytes or `-1` if file does not exist or permissions do not allow access.
   * @throws if file can become accessible after retry (e.g. on network error)
   *
   * @example
   * ```ts
   * async getFileSize(filename: string): Promise<number> {
   *   const filePath = this.resolve(filename);
   *   return await fs
   *     .stat(filePath)
   *     .then((stat) => ({ size: stat.isFile() ? stat.size : -1 }))
   *     .catch(() => ({ size: -1 }));
   * }
   * ```
   */
  getFileSize(filename: string): Promise<number>;

  /**
   * Execute action with readable stream (actions can be concurrency limited by the store).
   * Action resolves when stream is closed by handler @see HttpHelpers.createRequestHandler
   * 
   * @param filename - existing file name (for which @see ObjectStore.getFileSize returned non-negative value)
   * @param range - valid range of bytes to read from the file (store may skip validation)
   * @param action - function to execute with the stream, responsible for closing the stream
   * @returns promise that resolves after the action is completed
   *
   * @example
   * ```ts
   * async withReadStream(params: {
   *   filename: string;
   *   range: FileRange;
   *   action: (stream: Readable) => Promise<void>;
   * }): Promise<void> {
   *   const { filename, range, action } = params;
   *   const filePath = this.resolve(filename);
   *
   *   try {
   *     const stream = createReadStream(filePath, range);
   *     return await action(stream);
   *   } catch (err: unknown) {
   *     console.error(`failed to create read stream for ${filename} - ${ensureError(err)}`);
   *     throw;
   *   }
   * }
   * ```
   */
  withReadStream(params: {
    filename: string;
    range: FileRange;
    action: (stream: Readable) => Promise<void>;
  }): Promise<void>;
}

/** Object store base URL in format accepted by Apache DataFusion and DuckDB */
export type ObjectStoreUrl = Branded<string, 'PFrameInternal.ObjectStoreUrl'>;

/** HTTP(S) request handler creation options */
export type RequestHandlerOptions = {
  /** Object store to serve files from, @see HttpHelpers.createFsStore */
  store: ObjectStore;
  /** Here will go caching options... */
}

/** Server configuration options */
export type HttpServerOptions = {
  /** HTTP(S) request handler function, @see HttpHelpers.createRequestHandler */
  handler: RequestListener;
  /** Port to bind to (@default 0 for auto-assignment) */
  port?: number;
  /** Do not apply authorization middleware to @param handler */
  noAuth?: true;
  /** Downgrade default HTTPS server to plain HTTP, @warning use only for testing */
  http?: true;
};

/** HTTP(S) server information and controls, @see HttpHelpers.createHttpServer */
export interface HttpServer {
  /** Server address info formatted as `http{s}://<host>:<port>/` */
  get address(): ObjectStoreUrl;
  /** Authorization token for Bearer scheme, undefined when @see HttpServerOptions.noAuth flag is set */
  get authToken(): string | undefined;
  /** Base64-encoded CA certificate in PEM format, undefined when @see HttpServerOptions.http flag is set */
  get base64EncodedCaCert(): string | undefined;
  /** Promise that resolves when the server is stopped */
  get stopped(): Promise<void>;
  /** Request server stop, returns the same promise as @see HttpServer.stopped */
  stop(): Promise<void>;
}

/** List of HTTP(S) related helper functions exposed by PFrame module */
export interface HttpHelpers {
  /**
   * Create an object store for serving files from a local directory.
   * Rejects if the provided path does not exist or is not a directory.
   */
  createFsStore(rootDir: string): Promise<ObjectStore>;

  /**
   * Create an HTTP request handler for serving files from an object store.
   * Accepts only paths of the form `/<filename>.parquet`, returns 410 otherwise.
   * Assumes that files are immutable (and sets cache headers accordingly).
   */
  createRequestHandler(options: RequestHandlerOptions): RequestListener;

  /**
   * Serve HTTP(S) requests using the provided handler on localhost port.
   * @returns promise that resolves when the server has stopped.
   *
   * @example
   * ```ts
   * const rootDir = '/path/to/directory/with/parquet/files';
   *
   * let store = await HttpHelpers.createFsStore(rootDir).catch((err: unknown) => {
   *   throw new Error(`Failed to create file store for ${rootDir} - ${ensureError(err)}`);
   * });
   *
   * const server = await HttpHelpers.createHttpServer({
   *   handler: HttpHelpers.createRequestHandler(store),
   * }).catch((err: unknown) => {
   *   throw new Error(`Failed to start HTTP server - ${ensureError(err)}`);
   * });
   *
   * const { address, authToken, base64EncodedCaCert } = server;
   *
   * await server.stop();
   * ```
   */
  createHttpServer(options: HttpServerOptions): Promise<HttpServer>;
}
