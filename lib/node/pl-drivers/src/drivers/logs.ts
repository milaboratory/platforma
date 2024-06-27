import { Computable, ComputableCtx } from '@milaboratory/computable';
import {
  PlTreeEntry,
  ResourceInfo,
  SynchronizedTreeState,
  treeEntryToResourceInfo
} from '@milaboratory/pl-tree';
import { StreamingAPI_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import { bigintToResourceId } from '@milaboratory/pl-client-v2';
import { LogsStreamDriver } from './logs_stream';
import { DownloadDriver } from './download_and_logs_blob';

export type AnyLogHandle = LiveLogHandle | ReadyLogHandle;

export type LiveLogHandle = `log+live://log/${string}`;
export type ReadyLogHandle = `log+ready://log/${string}`;

export type StreamingApiResponse = {
  response?: StreamingAPI_Response;
  live: boolean;
  shouldUpdateHandle: boolean;
};

export class LogsDriver {
  constructor(
    private readonly logsStreamDriver: LogsStreamDriver,
    private readonly downloadDriver: DownloadDriver,
  ) {}

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(
    res: PlTreeEntry,
    lines: number
  ): Computable<string | undefined>;
  getLastLogs(
    res: PlTreeEntry,
    lines: number,
    ctx: ComputableCtx
  ): Computable<string | undefined>;
  getLastLogs(
    res: PlTreeEntry,
    lines: number,
    ctx?: ComputableCtx
  ): Computable<string | undefined> | string | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getLastLogs(res, lines, ctx));

    const stream = streamManagerGetStream(ctx, res);
    if (stream === undefined) {
      ctx.markUnstable();
      return undefined;
    }

    if (isBlob(stream))
      return this.downloadDriver.getLastLogs(stream, lines, ctx);

    try {
      return this.logsStreamDriver.getLastLogs(stream, lines, ctx);
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        ctx.markUnstable();
        return undefined;
      }
      throw e;
    }
  }

  /** Returns a last line that has patternToSearch.
   * Notifies when a new line appeared or EOF reached. */
  getProgressLog(
    res: PlTreeEntry,
    patternToSearch: string
  ): Computable<string | undefined>;
  getProgressLog(
    res: PlTreeEntry,
    patternToSearch: string,
    ctx: ComputableCtx
  ): string | undefined;
  getProgressLog(
    res: PlTreeEntry,
    patternToSearch: string,
    ctx?: ComputableCtx
  ): Computable<string | undefined> | string | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) =>
        this.getProgressLog(res, patternToSearch, ctx)
      );

    const stream = streamManagerGetStream(ctx, res);
    if (stream === undefined) {
      ctx.markUnstable();
      return undefined;
    }

    if (isBlob(stream))
      return this.downloadDriver.getProgressLog(stream, patternToSearch, ctx);

    try {
      return this.logsStreamDriver.getProgressLog(stream, patternToSearch, ctx);
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        ctx.markUnstable();
        return undefined;
      }
      throw e;
    }
  }

  /** Returns an Id of a smart object, that can read logs directly from
   * the platform. */
  getLogHandle(res: ResourceInfo | PlTreeEntry): Computable<AnyLogHandle | undefined>;
  getLogHandle(
    res: PlTreeEntry,
    ctx: ComputableCtx
  ): AnyLogHandle | undefined;
  getLogHandle(
    res: PlTreeEntry,
    ctx?: ComputableCtx
  ): Computable<AnyLogHandle | undefined> | AnyLogHandle | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getLogHandle(res, ctx));

    const stream = streamManagerGetStream(ctx, res);
    if (stream === undefined) {
      ctx.markUnstable();
      return undefined;
    }

    if (isBlob(stream)) return this.downloadDriver.getLogHandle(stream, ctx);

    return this.logsStreamDriver.getLogHandle(stream, ctx);
  }

  async lastLines(
    handle: AnyLogHandle,
    lineCount: number,
    offsetBytes: bigint, // if 0n, then start from the end.
    searchStr?: string
  ): Promise<StreamingApiResponse> {
    if (isLiveLogHandle(handle))
      return await this.logsStreamDriver.lastLines(
        handle,
        lineCount,
        offsetBytes,
        searchStr
      );
    return await this.downloadDriver.lastLines(
      handle,
      lineCount,
      offsetBytes,
      searchStr
    );
  }

  async readText(
    handle: AnyLogHandle,
    lineCount: number,
    offsetBytes: bigint, // if 0n, then start from the beginning.
    searchStr?: string
  ): Promise<StreamingApiResponse> {
    if (isLiveLogHandle(handle))
      return await this.logsStreamDriver.readText(
        handle,
        lineCount,
        offsetBytes,
        searchStr
      );
    return await this.downloadDriver.readText(
      handle,
      lineCount,
      offsetBytes,
      searchStr
    );
  }
}

function isBlob(rInfo: ResourceInfo) {
  return !rInfo.type.name.startsWith('StreamWorkdir');
}

function streamManagerGetStream(ctx: ComputableCtx, manager: PlTreeEntry) {
  return ctx.accessor(manager).node().traverse('stream')?.resourceInfo
}

export function handleToData(handle: AnyLogHandle): ResourceInfo {
  let parsed: RegExpMatchArray | null;

  if (isLiveLogHandle(handle)) {
    parsed = handle.match(liveHandleRegex);
  } else if (isReadyLogHandle(handle)) {
    parsed = handle.match(readyHandleRegex);
  } else throw new Error(`Log handle is malformed: ${handle}`);
  if (parsed == null) throw new Error(`Log handle wasn't parsed: ${handle}`);

  const { resourceType, resourceVersion, resourceId } = parsed.groups!;

  return {
    id: bigintToResourceId(BigInt(resourceId)),
    type: { name: resourceType, version: resourceVersion }
  };
}

export function dataToHandle(live: boolean, rInfo: ResourceInfo): AnyLogHandle {
  if (live) {
    return `log+live://log/${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}` as LiveLogHandle;
  }

  return `log+ready://log/${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}` as ReadyLogHandle;
}

const liveHandleRegex =
  /^log\+live:\/\/log\/(?<resourceType>.*)\/(?<resourceVersion>.*)\/(?<resourceId>.*)$/;

export function isLiveLogHandle(handle: string): handle is LiveLogHandle {
  return liveHandleRegex.test(handle);
}

const readyHandleRegex =
  /^log\+ready:\/\/log\/(?<resourceType>.*)\/(?<resourceVersion>.*)\/(?<resourceId>.*)$/;

export function isReadyLogHandle(handle: string): handle is ReadyLogHandle {
  return readyHandleRegex.test(handle);
}
