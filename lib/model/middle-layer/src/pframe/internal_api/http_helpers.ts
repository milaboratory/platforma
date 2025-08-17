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
   * @throws on network errors
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
   * Execute action with readable stream.
   * Action resolves when stream is closed by handler @see HttpHelpers.createRequestHandler
   * 
   * @param filename - existing file name (for which @see ObjectStore.getFileSize returned non-negative value)
   * @param range - valid range of bytes to read from the file (store may skip validation)
   * @param action - function to execute with the stream, responsible for closing the stream
   * @returns promise that resolves after the action is completed
   * @throws on network errors
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
    range: FileRange;
    action: (stream: Readable) => Promise<void>;
  }): Promise<void>;
}

/** Object store base URL in format accepted by Apache DataFusion and DuckDB */
export type ObjectStoreUrl = Branded<string, 'PFrameInternal.ObjectStoreUrl'>;

/** Server configuration options */
export type HttpServerOptions = {
  /** HTTP request handler function */
  handler: RequestListener;
  /** Port to bind to (@default 0 for auto-assignment) */
  port?: number;
  /** Starts HTTPS server instead of HTTP */
  https?: true;
};

/** Result of the server start operation */
export interface HttpServer {
  /** Server address info in format accepted by Apache DataFusion and DuckDB */
  get address(): ObjectStoreUrl;
  /** Base64-encoded CA certificate in PEM format, defined when @see HttpServerOptions.https flag is set */
  get certificate(): string | undefined;
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
   * Accepts only paths of the form `/<filename>.parquet`, returns 410 otherwise.
   * Assumes that files are immutable (and sets cache headers accordingly).
   * Enforces authentication using Bearer scheme if @param authToken is provided.
   * @warning Always use @param authToken with HTTPS, otherwise anyone can steal the token.
   */
  createRequestHandler(store: ObjectStore, authToken?: string): RequestListener;

  /**
   * Serve HTTP requests using the provided handler on localhost port.
   * Returns a promise that resolves when the server is stopped.
   *
   * @example
   * ```ts
   * const rootDir = '/path/to/directory/with/parquet/files';
   * const authToken = randomUUID();
   *
   * let store = await HttpHelpers.createFsStore(rootDir).catch((err: unknown) => {
   *   throw new Error(`Failed to create file store for ${rootDir} - ${ensureError(err)}`);
   * });
   *
   * const server = await HttpHelpers.createHttpServer({
   *   handler: HttpHelpers.createRequestHandler(store, authToken),
   *   https: true,
   * }).catch((err: unknown) => {
   *   throw new Error(`Failed to start HTTP server - ${ensureError(err)}`);
   * });
   *
   * const _ = server.address;
   *
   * await server.stop();
   * ```
   */
  createHttpServer(options: HttpServerOptions): Promise<HttpServer>;
}
