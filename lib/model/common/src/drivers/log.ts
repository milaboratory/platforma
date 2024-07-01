export type AnyLogHandle = LiveLogHandle | ReadyLogHandle;

export type LiveLogHandle = `log+live://log/${string}`;
export type ReadyLogHandle = `log+ready://log/${string}`;

export type StreamingApiResponseOk = {
  shouldUpdateHandle: false;

  live: boolean;

  data: Uint8Array;
  size: number;
  newOffset: number;
}

export type StreamingApiResponseHandleOutdated = {
  shouldUpdateHandle: true;
}

export type StreamingApiResponse =
  | StreamingApiResponseOk
  | StreamingApiResponseHandleOutdated;

/** Driver to retrieve logs given log handle */
export interface LogsDriver {
  lastLines(
    handle: AnyLogHandle,
    lineCount: number,
    offsetBytes: number, // if -1, then start from the end
    searchStr?: string
  ): Promise<StreamingApiResponse>;

  readText(
    handle: AnyLogHandle,
    lineCount: number,
    offsetBytes: number, // if 0, then start from the beginning.
    searchStr?: string
  ): Promise<StreamingApiResponse>;
}
