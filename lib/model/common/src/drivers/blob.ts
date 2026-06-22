import type { Branded } from "../branding";
import { z } from "zod";

/** Handle of locally downloaded blob. This handle is issued only after the
 * blob's content is downloaded locally, and ready for quick access. */
export type LocalBlobHandle = Branded<string, "LocalBlobHandle">;

/** Handle of remote blob. This handle is issued as soon as the data becomes
 * available on the remote server. */
export type RemoteBlobHandle = Branded<string, "RemoteBlobHandle">;

/** Being configured inside the output structure provides information about
 * blob's content and means to retrieve it when needed. */
export interface BlobHandleAndSize<
  H extends LocalBlobHandle | RemoteBlobHandle = LocalBlobHandle | RemoteBlobHandle,
> {
  /** Handle to retrieve block content using {@link BlobDriver.getContent()} */
  readonly handle: H;

  /** Blob size in bytes. */
  readonly size: number;
}

/** Range in bytes, from should be less than to. */
export const RangeBytes = z.object({
  /** Included left border. */
  from: z.number().min(0),
  /** Excluded right border. */
  to: z.number().min(1),
});

export type RangeBytes = z.infer<typeof RangeBytes>;

export function newRangeBytesOpt(from?: number, to?: number): RangeBytes | undefined {
  if (from == undefined || to == undefined) {
    return undefined;
  }

  const range = { from, to };
  validateRangeBytes(range, "newRangeBytesOpt");

  return range;
}

export function validateRangeBytes(range: RangeBytes, errMsg: string) {
  if (range.from < 0 || range.from >= range.to) {
    throw new Error(`${errMsg}: invalid bytes range: ${range}`);
  }
}

/** Being configured inside the output structure provides information about
 * locally downloaded blob and means to retrieve it's content when needed. This
 * structure is created only after the blob's content is downloaded locally, and
 * ready for quick access. */
export type LocalBlobHandleAndSize = BlobHandleAndSize<LocalBlobHandle>;

/** Being configured inside the output structure provides information about
 * remote blob and means to retrieve it's content when needed. This structure
 * is created as soon as remote blob becomes available. */
export type RemoteBlobHandleAndSize = BlobHandleAndSize<RemoteBlobHandle>;

export type GetContentOptions = {
  /** Byte range in [from, to) format. */
  range?: RangeBytes;
  /** Signal to abort the operation early. */
  signal?: AbortSignal;
};

export type ContentHandler<T> = (content: ReadableStream, size: number) => Promise<T>;

/** Defines API of blob driver as it is seen from the block UI code. */
export interface BlobDriver {
  /**
   * Given the blob handle returns its content.
   * Depending on the handle type, content will be served from locally downloaded file,
   * or directly from remote platforma storage.
   */
  getContent(handle: LocalBlobHandle | RemoteBlobHandle, range?: RangeBytes): Promise<Uint8Array>;
}

/**
 * Operational metrics of the blob download driver.
 */
export type BlobDriverMetrics = {
  /** Downloads that bypassed the ranges (sparse) cache. Counted when issued, so failed downloads still count. */
  uncachedRequests: number;
  /** Bytes actually streamed off the wire on the uncached path. */
  uncachedRequestBytes: number;
  /** Currently active remote downloads. */
  downloadsInFlight: number;
  /** Sum of known sizes of active downloads — progress-bar denominator. */
  inFlightBytesTotal: number;
  /** Sum of bytes received so far across active downloads — progress-bar numerator. */
  inFlightBytesReceived: number;
  /** Cached presigned URL was used and the download started successfully (one gRPC sign call avoided). */
  presignedUrlCacheHits: number;
  /** No cached presigned URL; a fresh one was fetched. */
  presignedUrlCacheMisses: number;
  /** Cached presigned URL was rejected (HTTP 400) and re-fetched — signals the TTL safety margin is too loose. */
  presignedUrlStaleHits: number;
  /** Total latency of presigned-URL fetch calls (misses + stale hits); divide by their count for the mean cost a hit avoids. */
  presignedUrlRequestSumLatencyMs: number;
};
