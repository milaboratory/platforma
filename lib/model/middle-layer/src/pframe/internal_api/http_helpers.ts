import type { Readable } from 'node:stream';
import type { RequestListener } from 'node:http';
import type { Branded, Base64Encoded } from '@milaboratories/pl-model-common';
import type { Logger } from './common';

/** Parquet file extension */
export const ParquetExtension = '.parquet' as const;

/** Parquet file name */
export type ParquetFileName = Branded<`${string}.parquet`, 'PFrameInternal.ParquetFileName'>;

export type FileRange = {
  /** Start byte position (inclusive) */
  start: number;
  /** End byte position (inclusive) */
  end: number;
}

/** HTTP range as of RFC 9110 <https://datatracker.ietf.org/doc/html/rfc9110#name-range> */
export type HttpRange =
  | {
      /**
       * Get file content in the specified byte range
       * 
       * @example
       * ```
       * GET /file.parquet HTTP/1.1
       * Range: bytes=0-1023
       * ```
       */
      type: 'bounded';
      /** Start byte position (inclusive) */
      start: number;
      /** End byte position (inclusive) */
      end: number;
    }
  | {
      /**
       * Get byte range starting from the specified offset
       * 
       * @example
       * ```
       * GET /file.parquet HTTP/1.1
       * Range: bytes=1024-
       * ```
       */
      type: 'offset';
      /** Start byte position (inclusive) */
      offset: number;
    }
  | {
      /**
       * Get byte range starting from the specified suffix
       * 
       * @example
       * ```
       * GET /file.parquet HTTP/1.1
       * Range: bytes=-1024
       * ```
       */
      type: 'suffix';
      /** End byte position (inclusive) */
      suffix: number;
    };

/** HTTP method passed to object store */
export type HttpMethod = 'GET' | 'HEAD' | 'PROPFIND';

/** HTTP response from object store */
export type ObjectStoreResponse =
  | {
      /**
       * Will be translated to 500 Internal Server Error by the handler
       * or 408 Request Timeout if the request was aborted
       */
      type: 'InternalError';
    }
  | {
      /** Will be translated to 404 Not Found by the handler */
      type: 'NotFound';
    }
  | {
      /** Will be translated to 416 Range Not Satisfiable by the handler */
      type: 'RangeNotSatisfiable';
      /** Total file size in bytes */
      size: number;
    }
  | {
      /** Will be translated to 200 OK or 206 Partial Content by the handler */
      type: 'Ok';
      /** Total file size in bytes */
      size: number;
      /** File range translated from HTTP range */
      range: FileRange;
      /** Stream of file content, undefined for HEAD requests */
      data?: Readable;
    }

/** Common options for object store creation */
export interface ObjectStoreOptions {
  /** Logger instance, no logging is performed when not provided */
  logger?: Logger;
}

/** Options for file system object store creation */
export interface FsStoreOptions extends ObjectStoreOptions {
  /** Local directory to serve files from */
  rootDir: string;
}

export interface ObjectStore {
  /**
   * Proxy HTTP(S) request for parquet file to object store.
   * Callback promise resolves when stream is closed by handler @see HttpHelpers.createRequestHandler
   * Callback API is used so that ObjectStore can limit the number of concurrent requests.
   */
  request(
    filename: ParquetFileName,
    params: {
      method: HttpMethod;
      range?: HttpRange;
      signal: AbortSignal;
      callback: (response: ObjectStoreResponse) => Promise<void>;
    }
  ): void;
}

/** File system abstraction for request handler factory, @see HttpHelpers.createRequestHandler */
export abstract class BaseObjectStore implements ObjectStore {
  protected readonly logger: Logger;

  constructor(options: ObjectStoreOptions) {
    this.logger = options.logger ?? (() => {});
  }

  /** Translate HTTP range to file range, @returns null if the range is not satisfiable */
  protected translate(fileSize: number, range?: HttpRange): FileRange | null {
    if (!range) return { start: 0, end: fileSize - 1 };
    switch (range.type) {
      case 'bounded':
        if (range.end >= fileSize) return null;
        return { start: range.start, end: range.end };
      case 'offset':
        if (range.offset >= fileSize) return null;
        return { start: range.offset, end: fileSize - 1 };
      case 'suffix':
        if (range.suffix > fileSize) return null;
        return { start: fileSize - range.suffix, end: fileSize - 1 };
    }
  }

  /**
   * Proxy HTTP(S) request for parquet file to object store.
   * Callback promise resolves when stream is closed by handler @see HttpHelpers.createRequestHandler
   * Callback API is used so that ObjectStore can limit the number of concurrent requests.
   */
  abstract request(
    filename: ParquetFileName,
    params: {
      method: HttpMethod;
      range?: HttpRange;
      signal: AbortSignal;
      callback: (response: ObjectStoreResponse) => Promise<void>;
    }
  ): Promise<void>;
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
  /** Port to bind to, @default 0 for auto-assignment */
  port?: number;
  /** Do not apply authorization middleware to @param handler */
  noAuth?: true;
  /** Downgrade default HTTPS server to plain HTTP, @warning use only for testing */
  noHttps?: true;
};

/**
 * Long unique opaque string for use in Bearer authorization header
 * 
 * @example
 * ```ts
 * request.setHeader('Authorization', `Bearer ${authToken}`);
 * ```
 */
export type HttpAuthorizationToken = Branded<string, 'PFrameInternal.HttpAuthorizationToken'>;

/**
 * TLS certificate in PEM format
 * 
 * @example
 * ```txt
 * -----BEGIN CERTIFICATE-----
 * MIIC2zCCAcOgAwIBAgIJaVW7...
 * ...
 * ...Yf9CRK8fgnukKM7TJ
 * -----END CERTIFICATE-----
 * ```
 */
export type PemCertificate = Branded<string, 'PFrameInternal.PemCertificate'>;

/** HTTP(S) server connection settings, {@link HttpHelpers.createHttpServer} */
export type HttpServerInfo = {
  /** URL of the HTTP(S) server formatted as `http{s}://<host>:<port>/` */
  url: ObjectStoreUrl;
  /** Authorization token for Bearer scheme, undefined when @see HttpServerOptions.noAuth flag is set */
  authToken?: HttpAuthorizationToken;
  /** Encoded CA certificate of HTTPS server, undefined when @see HttpServerOptions.noHttps flag is set */
  encodedCaCert?: Base64Encoded<PemCertificate>;
};

/** HTTP(S) server information and controls, @see HttpHelpers.createHttpServer */
export interface HttpServer {
  /** Server configuration information for initiating connections from clients */
  get info(): HttpServerInfo;
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
  createFsStore(options: FsStoreOptions): Promise<ObjectStore>;

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
   * let store = await HttpHelpers.createFsStore({ rootDir }).catch((err: unknown) => {
   *   throw new Error(`Failed to create file store for ${rootDir} - ${ensureError(err)}`);
   * });
   *
   * const server = await HttpHelpers.createHttpServer({
   *   handler: HttpHelpers.createRequestHandler({ store }),
   * }).catch((err: unknown) => {
   *   throw new Error(`Failed to start HTTPS server - ${ensureError(err)}`);
   * });
   *
   * const { url, authToken, encodedCaCert } = server.info;
   *
   * await server.stop();
   * ```
   */
  createHttpServer(options: HttpServerOptions): Promise<HttpServer>;
}
