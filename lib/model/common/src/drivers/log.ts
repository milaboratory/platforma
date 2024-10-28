/** Handle of logs. This handle should be passed
 * to the driver for retrieving logs. */
export type AnyLogHandle = LiveLogHandle | ReadyLogHandle;

/** Handle of the live logs of a program.
 * The resource that represents a log can be deleted,
 * in this case the handle should be refreshed. */
export type LiveLogHandle = `log+live://log/${string}`;

/** Handle of the ready logs of a program. */
export type ReadyLogHandle = `log+ready://log/${string}`;

/** Type guard to check if log is live, and corresponding porcess is not finished. */
export function isLiveLog(handle: AnyLogHandle | undefined): handle is LiveLogHandle {
  return handle !== undefined && handle.startsWith('log+live://log/');
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
    searchStr?: string
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
    searchStr?: string
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
