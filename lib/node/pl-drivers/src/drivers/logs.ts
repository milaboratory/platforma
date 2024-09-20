import { Computable, ComputableCtx } from '@milaboratories/computable';
import { PlTreeEntry, ResourceInfo } from '@milaboratories/pl-tree';
import { bigintToResourceId } from '@milaboratories/pl-client';
import { LogsStreamDriver } from './logs_stream';
import { DownloadDriver } from './download_and_logs_blob';
import * as sdk from '@milaboratories/pl-model-common';

export class LogsDriver implements sdk.LogsDriver {
  constructor(
    private readonly logsStreamDriver: LogsStreamDriver,
    private readonly downloadDriver: DownloadDriver
  ) {}

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(res: PlTreeEntry, lines: number): Computable<string | undefined>;
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
      ctx.markUnstable('no stream in stream manager');
      return undefined;
    }

    if (isBlob(stream))
      return this.downloadDriver.getLastLogs(stream, lines, ctx);

    try {
      return this.logsStreamDriver.getLastLogs(stream, lines, ctx);
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        ctx.markUnstable(
          `NOT_FOUND in logs stream driver while getting last logs: ${e}`
        );
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
      ctx.markUnstable('no stream in stream manager');
      return undefined;
    }

    if (isBlob(stream))
      return this.downloadDriver.getProgressLog(stream, patternToSearch, ctx);

    try {
      return this.logsStreamDriver.getProgressLog(stream, patternToSearch, ctx);
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        ctx.markUnstable(
          `NOT_FOUND in logs stream driver while getting a progress log: ${e}`
        );
        return undefined;
      }
      throw e;
    }
  }

  /** Returns an Id of a smart object, that can read logs directly from
   * the platform. */
  getLogHandle(
    res: ResourceInfo | PlTreeEntry
  ): Computable<sdk.AnyLogHandle | undefined>;
  getLogHandle(
    res: PlTreeEntry,
    ctx: ComputableCtx
  ): sdk.AnyLogHandle | undefined;
  getLogHandle(
    res: PlTreeEntry,
    ctx?: ComputableCtx
  ): Computable<sdk.AnyLogHandle | undefined> | sdk.AnyLogHandle | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getLogHandle(res, ctx));

    const stream = streamManagerGetStream(ctx, res);
    if (stream === undefined) {
      ctx.markUnstable('no stream in stream manager');
      return undefined;
    }

    if (isBlob(stream)) return this.downloadDriver.getLogHandle(stream, ctx);

    return this.logsStreamDriver.getLogHandle(stream, ctx);
  }

  async lastLines(
    handle: sdk.AnyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string
  ): Promise<sdk.StreamingApiResponse> {
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
    handle: sdk.AnyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string
  ): Promise<sdk.StreamingApiResponse> {
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
  return ctx.accessor(manager).node().traverse('stream')?.resourceInfo;
}

export function handleToData(handle: sdk.AnyLogHandle): ResourceInfo {
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

export function dataToHandle(
  live: boolean,
  rInfo: ResourceInfo
): sdk.AnyLogHandle {
  if (live) {
    return `log+live://log/${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}` as sdk.LiveLogHandle;
  }

  return `log+ready://log/${rInfo.type.name}/${rInfo.type.version}/${BigInt(rInfo.id)}` as sdk.ReadyLogHandle;
}

const liveHandleRegex =
  /^log\+live:\/\/log\/(?<resourceType>.*)\/(?<resourceVersion>.*)\/(?<resourceId>.*)$/;

export function isLiveLogHandle(handle: string): handle is sdk.LiveLogHandle {
  return liveHandleRegex.test(handle);
}

const readyHandleRegex =
  /^log\+ready:\/\/log\/(?<resourceType>.*)\/(?<resourceVersion>.*)\/(?<resourceId>.*)$/;

export function isReadyLogHandle(handle: string): handle is sdk.ReadyLogHandle {
  return readyHandleRegex.test(handle);
}
