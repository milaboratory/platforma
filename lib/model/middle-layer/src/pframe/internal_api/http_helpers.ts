import type { Readable } from 'node:stream';
import type { RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Branded } from '@milaboratories/pl-model-common';

/** File statistics */
export type FileStats = {
  /** File size in bytes */
  size: number;
  /** File modification time if available */
  mtime?: Date;
};

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
   * Check if file exists
   *
   * @example
   * ```ts
   * async fileExists(filename: string): Promise<boolean> {
   *   const filePath = this.resolve(filename);
   *   try {
   *     await fs.access(filePath, constants.F_OK);
   *     return true;
   *   } catch {
   *     return false;
   *   }
   * }
   * ```
   */
  fileExists(filename: string): Promise<boolean>;

  /**
   * Get file statistics
   *
   * @example
   * ```ts
   * async getFileStats(filename: string): Promise<FileStats> {
   *   const filePath = this.resolve(filename);
   *   try {
   *     const stats = await fs.stat(filePath);
   *     return {
   *       size: stats.size,
   *       mtime: stats.mtime
   *     };
   *   } catch (err: unknown) {
   *     throw new Error(
   *       `Failed to get file statistics for: ${filename} - ${ensureError(err)}`
   *     );
   *   }
   * }
   * ```
   */
  getFileStats(filename: string): Promise<FileStats>;

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
   *   try {
   *     await action(stream);
   *   } finally {
   *     if (!stream.destroyed) {
   *       stream.destroy();
   *     }
   *   }
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

/** Server configuration options */
export type HttpServerOptions = {
  /** HTTP request handler function */
  handler: RequestListener;
  /** Host to bind to (defaults to '127.0.0.1') */
  host?: string;
  /** Port to bind to (defaults to 0 for auto-assignment) */
  port?: number;
  /** AbortSignal to stop the server */
  signal: AbortSignal;
};

/** Result of the server start operation */
export type HttpServerStartResult = {
  /** Server address info */
  address: AddressInfo;
  /** Promise that resolves when the server is stopped */
  stopped: Promise<void>;
};

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
   */
  createRequestHandler(store: ObjectStore): RequestListener;

  /**
   * Create an object store URL from the server address info.
   * Result of this function is intended to be passed to PFrames as data source parquet prefix.
   */
  createObjectStoreUrl(info: AddressInfo): ObjectStoreUrl;

  /**
   * Serve HTTP requests using the provided handler on the given host and port.
   * Returns a promise that resolves when the server is stopped.
   *
   * @example
   * ```ts
   * const abortController = new AbortController();
   * const rootDir = '/path/to/directory/with/parquet/files';
   * const port = 3000;
   *
   * let store = await HttpHelpers.createFsStore(rootDir).catch((err: unknown) => {
   *   throw new Error(`Failed to create file store for ${rootDir} - ${ensureError(err)}`);
   * });
   *
   * const { address: serverAddress, stopped: serverStopped } = await HttpHelpers.serve({
   *   handler: HttpHelpers.createRequestHandler(store),
   *   port,
   *   signal: abortController.signal
   * }).catch((err: unknown) => {
   *   throw new Error(`Failed to start http server on port ${port} - ${ensureError(err)}`);
   * });
   *
   * const _ = HttpHelpers.createObjectStoreUrl(serverAddress);
   *
   * abortController.abort();
   * await serverStopped;
   * ```
   */
  serve(options: HttpServerOptions): Promise<HttpServerStartResult>;
}
