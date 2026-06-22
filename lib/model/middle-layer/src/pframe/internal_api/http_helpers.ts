import type { Readable } from "node:stream";
import type { RequestListener } from "node:http";
import type { Branded, Base64Encoded } from "@milaboratories/pl-model-common";
import type { Logger } from "./common";

/** Parquet file extension */
export const ParquetExtension = ".parquet" as const;

/** Parquet file name */
export type ParquetFileName = Branded<`${string}.parquet`, "PFrameInternal.ParquetFileName">;

export type FileRange = {
  /** Start byte position (inclusive) */
  start: number;
  /** End byte position (inclusive) */
  end: number;
};

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
      type: "bounded";
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
      type: "offset";
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
      type: "suffix";
      /** End byte position (inclusive) */
      suffix: number;
    };

/** HTTP method passed to object store */
export type HttpMethod = "GET" | "HEAD";

/** HTTP response from object store */
export type ObjectStoreResponse =
  | {
      /**
       * Will be translated to 500 Internal Server Error by the handler
       * or 408 Request Timeout if the request was aborted
       */
      type: "InternalError";
    }
  | {
      /** Will be translated to 404 Not Found by the handler */
      type: "NotFound";
    }
  | {
      /** Will be translated to 416 Range Not Satisfiable by the handler */
      type: "RangeNotSatisfiable";
      /** Total file size in bytes */
      size: number;
    }
  | {
      /** Will be translated to 200 OK or 206 Partial Content by the handler */
      type: "Ok";
      /** Total file size in bytes */
      size: number;
      /** File range translated from HTTP range */
      range: FileRange;
      /** Stream of file content, undefined for HEAD requests */
      data?: Readable;
    };

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
    },
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
      case "bounded":
        if (range.end >= fileSize) return null;
        return { start: range.start, end: range.end };
      case "offset":
        if (range.offset >= fileSize) return null;
        return { start: range.offset, end: fileSize - 1 };
      case "suffix":
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
    },
  ): Promise<void>;
}

/** Configuration for {@link HttpHelpers.createCachingObjectStore} */
export type CacheConfig = {
  /** Filesystem path where the cache persists its data */
  cachePath: string;
  /** Hard total size budget in bytes; the cache self-stabilizes near this size */
  maxSizeBytes: number;
  /**
   * Max share of the budget a single file may occupy (0..1); when a file exceeds it, that
   * file's oldest ranges are evicted first. Stops one large scan from flushing the working set.
   */
  admissionFraction: number;
  /** Upper bound on previously-evicted (ghost) files remembered to guide readmission; resident files are already byte-bounded */
  maxFilesTracked: number;
};

/**
 * Cumulative cache event counters. Surfaced both as lifetime totals (persisted across restarts)
 * and as a per-process session view, @see CacheMetrics.
 */
export type CacheCounters = {
  /** Requests fully served from cache */
  hits: number;
  /** Requests that fell through to upstream */
  misses: number;
  /** Bytes served from cache */
  bytesServed: number;
  /**
   * Bytes requested by clients that were not cached; compare with {@link bytesFetched} for read-ahead
   * amplification. Optional until producers (serv) emit it; treat absent as not-yet-reported.
   */
  bytesMissed?: number;
  /** Bytes downloaded from upstream on misses, including read-ahead and read-behind */
  bytesFetched: number;
  /** Bytes evicted to keep the cache within its total size budget, @see CacheConfig.maxSizeBytes */
  bytesEvictedByBudget: number;
  /** Bytes evicted because a single file exceeded its allowed share of the budget, @see CacheConfig.admissionFraction */
  bytesEvictedByFileCap: number;
  /** Files promoted on observed reuse, so they are retained longer than first-time entries */
  promotions: number;
  /** Previously evicted files that were re-requested and readmitted */
  ghostReadmissions: number;
};

/** Snapshot of cache state and counters, @see CachingObjectStore.getMetrics */
export type CacheMetrics = {
  /** Current resident bytes */
  sizeBytes: number;
  /** Number of files with resident (cached) bytes */
  residentFiles: number;
  /** Number of previously-evicted (ghost) files remembered, <= @see CacheConfig.maxFilesTracked */
  ghostFiles: number;
  /** Counters cumulative across all sessions (persisted) */
  lifetime: CacheCounters;
  /** The same counters scoped to the current process */
  session: CacheCounters;
};

/**
 * Options for caching object store creation, @see HttpHelpers.createCachingObjectStore.
 * Standalone (not extending {@link ObjectStoreOptions}): a caching store is a decorator over
 * `upstream`, so source-store options do not apply to it.
 */
export interface CachingObjectStoreOptions {
  /** Upstream store consulted on cache misses */
  upstream: ObjectStore;
  /** Cache configuration */
  config: CacheConfig;
  /** Logger instance, no logging is performed when not provided */
  logger?: Logger;
}

/**
 * An {@link ObjectStore} that serves byte ranges from a persistent local cache, fetching misses
 * from an upstream store. This is the single handle for the cache: pass it as
 * {@link RequestHandlerOptions.store}, read {@link CachingObjectStore.getMetrics}, and dispose it
 * to release the cache, @see HttpHelpers.createCachingObjectStore.
 */
export interface CachingObjectStore extends ObjectStore, AsyncDisposable {
  /** Instantaneous cache state plus lifetime/session counters */
  getMetrics(): CacheMetrics;
  /** Drop all cached data and zero the counters (test/benchmark use) */
  reset(): Promise<void>;
}

/** Object store base URL in format accepted by Apache DataFusion and DuckDB */
export type ObjectStoreUrl = Branded<string, "PFrameInternal.ObjectStoreUrl">;

/** HTTP(S) request handler creation options */
export type RequestHandlerOptions = {
  /**
   * Object store to serve files from. Compose caching by wrapping the upstream store with
   * {@link HttpHelpers.createCachingObjectStore} and passing the result here,
   * @see HttpHelpers.createFsStore
   */
  store: ObjectStore;
};

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
export type HttpAuthorizationToken = Branded<string, "PFrameInternal.HttpAuthorizationToken">;

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
export type PemCertificate = Branded<string, "PFrameInternal.PemCertificate">;

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
   * Wrap an upstream object store in a persistent byte-range cache backed by SQLite.
   * The returned store is itself an {@link ObjectStore} (pass it to {@link createRequestHandler})
   * and additionally exposes metrics and reset. Dispose it to close the cache database.
   */
  createCachingObjectStore(options: CachingObjectStoreOptions): Promise<CachingObjectStore>;

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
