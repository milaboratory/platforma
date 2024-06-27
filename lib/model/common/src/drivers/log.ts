export type AnyLogHandle = LiveLogHandle | ReadyLogHandle;

export type LiveLogHandle = `log+live://log/${string}`;
export type ReadyLogHandle = `log+ready://log/${string}`;

export type StreamingApiResponse = {
  data: Uint8Array;
  size: bigint;
  newOffset: bigint;

  live: boolean;
  shouldUpdateHandle: boolean;
};
