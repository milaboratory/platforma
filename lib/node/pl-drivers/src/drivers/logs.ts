import { Computable, ComputableCtx } from '@milaboratory/computable';
import {
  PlTreeEntry,
  ResourceInfo,
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
    private readonly downloadDriver: DownloadDriver
  ) {}

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number
  ): Computable<string | undefined>;
  getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number,
    ctx: ComputableCtx
  ): Computable<string | undefined>;
  getLastLogs(
    res: ResourceInfo | PlTreeEntry,
    lines: number,
    ctx?: ComputableCtx
  ): Computable<string | undefined> | string | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getLastLogs(res, lines, ctx));

    const rInfo = treeEntryToResourceInfo(res, ctx);

    if (!isStream(rInfo))
      return this.downloadDriver.getLastLogs(rInfo, lines, ctx);

    try {
      return this.logsStreamDriver.getLastLogs(rInfo, lines, ctx);
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
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string
  ): Computable<string | undefined>;
  getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string,
    ctx: ComputableCtx
  ): string | undefined;
  getProgressLog(
    res: ResourceInfo | PlTreeEntry,
    patternToSearch: string,
    ctx?: ComputableCtx
  ): Computable<string | undefined> | string | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) =>
        this.getProgressLog(res, patternToSearch, ctx)
      );

    const rInfo = treeEntryToResourceInfo(res, ctx);

    if (!isStream(rInfo))
      return this.downloadDriver.getProgressLog(rInfo, patternToSearch, ctx);

    try {
      return this.logsStreamDriver.getProgressLog(rInfo, patternToSearch, ctx);
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
  getLogHandle(res: ResourceInfo | PlTreeEntry): Computable<AnyLogHandle>;
  getLogHandle(
    res: ResourceInfo | PlTreeEntry,
    ctx: ComputableCtx
  ): AnyLogHandle;
  getLogHandle(
    res: ResourceInfo | PlTreeEntry,
    ctx?: ComputableCtx
  ): Computable<AnyLogHandle> | AnyLogHandle {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getLogHandle(res, ctx));

    const rInfo = treeEntryToResourceInfo(res, ctx);

    if (!isStream(rInfo)) return this.downloadDriver.getLogHandle(rInfo, ctx);
    return this.logsStreamDriver.getLogHandle(rInfo, ctx);
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

function isStream(rInfo: ResourceInfo) {
  return rInfo.type.name.startsWith('StreamWorkdir');
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
