import type { ComputableCtx } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type { PlTreeEntry, ResourceInfo } from '@milaboratories/pl-tree';
import type { LogsStreamDriver } from './logs_stream';
import type * as sdk from '@milaboratories/pl-model-common';
import type { MiLogger } from '@milaboratories/ts-helpers';
import type { DownloadDriver } from './download_blob';
import { isLiveLogHandle } from './helpers/logs_handle';

export class LogsDriver implements sdk.LogsDriver {
  constructor(
    private readonly logger: MiLogger,
    private readonly logsStreamDriver: LogsStreamDriver,
    private readonly downloadDriver: DownloadDriver,
  ) {}

  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(res: PlTreeEntry, lines: number): Computable<string | undefined>;
  getLastLogs(res: PlTreeEntry, lines: number, ctx: ComputableCtx): Computable<string | undefined>;
  getLastLogs(
    res: PlTreeEntry,
    lines: number,
    ctx?: ComputableCtx,
  ): Computable<string | undefined> | string | undefined {
    if (ctx === undefined) return Computable.make((ctx) => this.getLastLogs(res, lines, ctx));

    const stream = streamManagerGetStream(ctx, res);
    if (stream === undefined) {
      ctx.markUnstable('no stream in stream manager');
      return undefined;
    }

    if (isBlob(stream)) return this.downloadDriver.getLastLogs(stream, lines, ctx);

    try {
      return this.logsStreamDriver.getLastLogs(stream, lines, ctx);
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        ctx.markUnstable(`NOT_FOUND in logs stream driver while getting last logs: ${e}`);
        return undefined;
      }
      throw e;
    }
  }

  /** Returns a last line that has patternToSearch.
   * Notifies when a new line appeared or EOF reached. */
  getProgressLog(res: PlTreeEntry, patternToSearch: string): Computable<string | undefined>;
  getProgressLog(res: PlTreeEntry, patternToSearch: string, ctx: ComputableCtx): string | undefined;
  getProgressLog(
    res: PlTreeEntry,
    patternToSearch: string,
    ctx?: ComputableCtx,
  ): Computable<string | undefined> | string | undefined {
    if (ctx === undefined)
      return Computable.make((ctx) => this.getProgressLog(res, patternToSearch, ctx));

    const stream = streamManagerGetStream(ctx, res);
    if (stream === undefined) {
      ctx.markUnstable('no stream in stream manager');
      return undefined;
    }

    if (isBlob(stream)) return this.downloadDriver.getProgressLog(stream, patternToSearch, ctx);

    try {
      return this.logsStreamDriver.getProgressLog(stream, patternToSearch, ctx);
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        ctx.markUnstable(`NOT_FOUND in logs stream driver while getting a progress log: ${e}`);
        return undefined;
      }
      throw e;
    }
  }

  /** Returns an Id of a smart object, that can read logs directly from
   * the platform. */
  getLogHandle(res: ResourceInfo | PlTreeEntry): Computable<sdk.AnyLogHandle | undefined>;
  getLogHandle(res: PlTreeEntry, ctx: ComputableCtx): sdk.AnyLogHandle | undefined;
  getLogHandle(
    res: PlTreeEntry,
    ctx?: ComputableCtx,
  ): Computable<sdk.AnyLogHandle | undefined> | sdk.AnyLogHandle | undefined {
    if (ctx === undefined) return Computable.make((ctx) => this.getLogHandle(res, ctx));

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
    searchStr?: string,
  ): Promise<sdk.StreamingApiResponse> {
    if (isLiveLogHandle(handle))
      return await this.logsStreamDriver.lastLines(handle, lineCount, offsetBytes, searchStr);
    return await this.downloadDriver.lastLines(handle, lineCount, offsetBytes, searchStr);
  }

  async readText(
    handle: sdk.AnyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string,
  ): Promise<sdk.StreamingApiResponse> {
    if (isLiveLogHandle(handle))
      return await this.logsStreamDriver.readText(handle, lineCount, offsetBytes, searchStr);
    return await this.downloadDriver.readText(handle, lineCount, offsetBytes, searchStr);
  }
}

function isBlob(rInfo: ResourceInfo) {
  return !rInfo.type.name.startsWith('StreamWorkdir');
}

function streamManagerGetStream(ctx: ComputableCtx, manager: PlTreeEntry) {
  return ctx.accessor(manager).node().traverse('stream')?.resourceInfo;
}
