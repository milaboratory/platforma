import type { Branded } from "../branding";

/** Prefix constants — single source of truth for handle format. */
const LIVE_LOG_PREFIX = "log+live://log/";
const READY_LOG_PREFIX = "log+ready://log/";

/** Handle of the live logs of a program.
 * The resource that represents a log can be deleted,
 * in this case the handle should be refreshed. */
export type LiveLogHandle = Branded<`${typeof LIVE_LOG_PREFIX}${string}`, "LiveLogHandle">;

/** Handle of the ready logs of a program. */
export type ReadyLogHandle = Branded<`${typeof READY_LOG_PREFIX}${string}`, "ReadyLogHandle">;

/** Handle of logs. This handle should be passed
 * to the driver for retrieving logs.
 *
 * A handle may be composite: the logs of several attempts of one exec (exec fallbacks),
 * read as one text with a delimiter after every finished attempt. A composite handle has
 * the same live/ready prefixes, so it is an ordinary {@link LiveLogHandle} or
 * {@link ReadyLogHandle} to everything but the driver; see {@link isCompositeLogHandle}. */
export type AnyLogHandle = LiveLogHandle | ReadyLogHandle;

/** Path segment that follows the live/ready prefix in a composite log handle. */
// "@" never starts a resource type name, so no single-log handle has this segment
const COMPOSITE_LOG_SEGMENT = "@composite/";

/** Checks if the handle is composite, i.e. joins the logs of several exec attempts.
 * Consumers need not tell composite handles apart: reading, offsets and liveness work
 * the same way as for a handle of a single log. */
export function isCompositeLogHandle(handle: AnyLogHandle): boolean {
  return (
    handle.startsWith(LIVE_LOG_PREFIX + COMPOSITE_LOG_SEGMENT) ||
    handle.startsWith(READY_LOG_PREFIX + COMPOSITE_LOG_SEGMENT)
  );
}

/** Type guard to check if a value is any kind of log handle. */
export function isAnyLogHandle(value: unknown): value is AnyLogHandle {
  return (
    typeof value === "string" &&
    (value.startsWith(LIVE_LOG_PREFIX) || value.startsWith(READY_LOG_PREFIX))
  );
}

/** Type guard to check if log is live, and corresponding process is not finished. */
export function isLiveLog(handle: AnyLogHandle | undefined): handle is LiveLogHandle {
  return handle !== undefined && handle.startsWith(LIVE_LOG_PREFIX);
}

/** Driver to retrieve logs given log handle */
export interface LogsDriver {
  lastLines(
    /** A handle that was issued previously. */
    handle: AnyLogHandle,

    /** Allows client to limit total data sent from server. */
    lineCount: number,

    /** Makes streamer to perform seek operation to given offset before sending the contents.
     * Client can just use the <new_offset> value of the last response from server to continue streaming after reconnection.
     * If undefined, then starts from the end. */
    offsetBytes?: number,

    /** Is substring for line search pattern.
     * This option makes controller to send to the client only lines, that
     * have given substring. */
    searchStr?: string,
  ): Promise<StreamingApiResponse>;

  readText(
    /** A handle that was issued previously. */
    handle: AnyLogHandle,

    /** Allows client to limit total data sent from server. */
    lineCount: number,

    /** Makes streamer to perform seek operation to given offset before sending the contents.
     * Client can just use the <new_offset> value of the last response from server to continue streaming after reconnection.
     * If undefined of 0, then starts from the beginning. */
    offsetBytes?: number,

    /** Is substring for line search pattern.
     * This option makes controller to send to the client only lines, that
     * have given substring. */
    searchStr?: string,
  ): Promise<StreamingApiResponse>;
}

/** Response of the driver.
 * The caller should give a handle to retrieve it.
 * It can be OK or outdated, in which case the handle
 * should be issued again. */
export type StreamingApiResponse = StreamingApiResponseOk | StreamingApiResponseHandleOutdated;

export type StreamingApiResponseOk = {
  /** The handle don't have to be updated,
   * the response is OK. */
  shouldUpdateHandle: false;

  /** Whether the log can still grow or it's in a final state. */
  live: boolean;

  /** Data of the response, in bytes. */
  data: Uint8Array;
  /** Current size of the file. It can grow if it's still live. */
  size: number;
  /** Offset in bytes from the beginning of a file. */
  newOffset: number;
};

/** The handle should be issued again, this one is done. */
export type StreamingApiResponseHandleOutdated = {
  shouldUpdateHandle: true;
};

export type ProgressLogWithInfo = {
  progressLine?: string;
  live: boolean;
};
