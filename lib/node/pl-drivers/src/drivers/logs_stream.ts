import {
  ChangeSource,
  Computable,
  ComputableCtx,
  PollingComputableHooks,
  Watcher
} from '@milaboratories/computable';
import { ResourceId, resourceIdToString, stringifyWithResourceId } from '@milaboratories/pl-client';
import { asyncPool, CallersCounter, MiLogger } from '@milaboratories/ts-helpers';
import { ClientLogs } from '../clients/logs';
import { randomUUID } from 'node:crypto';
import { PlTreeEntry, ResourceInfo, treeEntryToResourceInfo } from '@milaboratories/pl-tree';
import { scheduler } from 'node:timers/promises';
import { StreamingAPI_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import * as sdk from '@milaboratories/pl-model-common';
import { PollingOps } from './helpers/polling_ops';
import { RpcError } from '@protobuf-ts/runtime-rpc';
import { getResourceInfoFromLogHandle, isLiveLogHandle, newLogHandle } from './helpers/logs_handle';

export type LogsStreamDriverOps = PollingOps & {
  /** Max number of concurrent requests to log streaming backend while calculating computable states */
  nConcurrentGetLogs: number;
};

export class LogsStreamDriver implements sdk.LogsDriver {
  /** Holds a map of StreamManager Resource Id to all logs of this stream. */
  private readonly idToLastLines: Map<ResourceId, LogGetter> = new Map();

  /** Holds a map of StreamManager Resource Id to the last log line of this stream. */
  private readonly idToProgressLog: Map<ResourceId, LogGetter> = new Map();

  /** Holds a map of StreamManager Resource Id to log id smart object. */
  private readonly hooks: PollingComputableHooks;

  constructor(
    private readonly logger: MiLogger,
    private readonly clientLogs: ClientLogs,
    private readonly opts: LogsStreamDriverOps = {
      nConcurrentGetLogs: 10,
      pollingInterval: 1000,
      stopPollingDelay: 1000
    }
  ) {
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      { stopDebounce: opts.stopPollingDelay },
      (resolve, reject) => this.scheduleOnNextState(resolve, reject)
    );
  }

  getLastLogs(res: ResourceInfo | PlTreeEntry, lines: number): Computable<string | undefined>;
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
    if (ctx == undefined) return Computable.make((ctx) => this.getLastLogs(res, lines, ctx));

    const r = treeEntryToResourceInfo(res, ctx);
    const callerId = randomUUID();
    ctx.attacheHooks(this.hooks);
    ctx.addOnDestroy(() => this.releaseLastLogs(r.id, callerId));

    const result = this.getLastLogsNoCtx(ctx.watcher, r, lines, callerId);
    ctx.markUnstable(
      'The logs are from stream, so we consider them unstable. Final values will be got from blobs.'
    );

    return result;
  }

  private getLastLogsNoCtx(
    w: Watcher,
    rInfo: ResourceInfo,
    lines: number,
    callerId: string
  ): string | undefined {
    let logGetter = this.idToLastLines.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LogGetter(this.logger, this.clientLogs, rInfo, lines);
      this.idToLastLines.set(rInfo.id, newLogGetter);

      logGetter = newLogGetter;
    }

    logGetter.attach(w, callerId);
    const result = logGetter.getLog();
    if (result.error != undefined) throw result.error;

    return result.log;
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
    if (ctx == undefined)
      return Computable.make((ctx) => this.getProgressLog(res, patternToSearch, ctx));

    const r = treeEntryToResourceInfo(res, ctx);
    const callerId = randomUUID();
    ctx.attacheHooks(this.hooks);
    ctx.addOnDestroy(() => this.releaseProgressLog(r.id, callerId));

    const result = this.getProgressLogNoCtx(ctx.watcher, r, patternToSearch, callerId);
    ctx.markUnstable(
      'The progress log is from the stream, so we consider it unstable. Final value will be got from blobs.'
    );

    return result;
  }

  private getProgressLogNoCtx(
    w: Watcher,
    rInfo: ResourceInfo,
    patternToSearch: string,
    callerId: string
  ): string | undefined {
    let logGetter = this.idToProgressLog.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LogGetter(this.logger, this.clientLogs, rInfo, 1, patternToSearch);
      this.idToProgressLog.set(rInfo.id, newLogGetter);

      logGetter = newLogGetter;
    }

    logGetter.attach(w, callerId);
    const result = logGetter.getLog();
    if (result.error) throw result.error;

    return result.log;
  }

  getLogHandle(res: ResourceInfo | PlTreeEntry): Computable<sdk.AnyLogHandle>;
  getLogHandle(res: ResourceInfo | PlTreeEntry, ctx: ComputableCtx): sdk.AnyLogHandle;
  getLogHandle(
    res: ResourceInfo | PlTreeEntry,
    ctx?: ComputableCtx
  ): Computable<sdk.AnyLogHandle> | sdk.AnyLogHandle {
    if (ctx == undefined) return Computable.make((ctx) => this.getLogHandle(res, ctx));

    const r = treeEntryToResourceInfo(res, ctx);

    const result = this.getLogHandleNoCtx(r);

    // All logs from streams should be considered unstable,
    // final value will be got from blobs.
    ctx.markUnstable(`live_log:${resourceIdToString(r.id)}`);

    return result;
  }

  private getLogHandleNoCtx(rInfo: ResourceInfo): sdk.AnyLogHandle {
    return newLogHandle(true, rInfo);
  }

  async lastLines(
    handle: sdk.AnyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string | undefined
  ) {
    return await this.tryWithNotFound(handle, () =>
      this.clientLogs.lastLines(
        getResourceInfoFromLogHandle(handle),
        lineCount,
        BigInt(offsetBytes ?? 0),
        searchStr
      )
    );
  }

  async readText(
    handle: sdk.AnyLogHandle,
    lineCount: number,
    offsetBytes?: number,
    searchStr?: string | undefined
  ) {
    return await this.tryWithNotFound(handle, () =>
      this.clientLogs.readText(
        getResourceInfoFromLogHandle(handle),
        lineCount,
        BigInt(offsetBytes ?? 0),
        searchStr
      )
    );
  }

  private async tryWithNotFound(
    handle: sdk.AnyLogHandle,
    method: () => Promise<StreamingAPI_Response>
  ): Promise<sdk.StreamingApiResponse> {
    if (!isLiveLogHandle(handle))
      throw new Error(`Not live log handle was passed to live log driver, handle: ${handle}`);

    try {
      const resp = await method();
      return {
        live: true,
        shouldUpdateHandle: false,
        data: resp.data,
        size: Number(resp.size),
        newOffset: Number(resp.newOffset)
      };
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        return { shouldUpdateHandle: true };
      }

      throw e;
    }
  }

  private async releaseLastLogs(rId: ResourceId, callerId: string) {
    const deleted = this.idToLastLines.get(rId)?.release(callerId);
    if (deleted) this.idToLastLines.delete(rId);
  }

  private async releaseProgressLog(rId: ResourceId, callerId: string) {
    const deleted = this.idToProgressLog.get(rId)?.release(callerId);
    if (deleted) this.idToProgressLog.delete(rId);
  }

  async releaseAll() {}

  private scheduledOnNextState: ScheduledRefresh[] = [];

  private scheduleOnNextState(resolve: () => void, reject: (err: any) => void): void {
    this.scheduledOnNextState.push({ resolve, reject });
  }

  /** Called from observer */
  private startUpdating(): void {
    this.keepRunning = true;
    if (this.currentLoop === undefined) this.currentLoop = this.mainLoop();
  }

  /** Called from observer */
  private stopUpdating(): void {
    this.keepRunning = false;
  }

  /** If true, main loop will continue polling pl state. */
  private keepRunning = false;
  /** Actual state of main loop. */
  private currentLoop: Promise<void> | undefined = undefined;

  private async mainLoop() {
    while (this.keepRunning) {
      const toNotify = this.scheduledOnNextState;
      this.scheduledOnNextState = [];

      try {
        const logs = this.getAllLogs();
        await asyncPool(
          this.opts.nConcurrentGetLogs,
          logs.map((getter) => async () => await getter.update())
        );

        toNotify.forEach((n) => n.resolve());
      } catch (e: any) {
        console.error(e);
        toNotify.forEach((n) => n.reject(e));
      }

      if (!this.keepRunning) break;
      await scheduler.wait(this.opts.pollingInterval);
    }

    this.currentLoop = undefined;
  }

  private getAllLogs(): Array<LogGetter> {
    return Array.from(this.idToLastLines.entries())
      .concat(Array.from(this.idToProgressLog.entries()))
      .map(([_, getter]) => getter);
  }
}

/** A job that gets last lines from a StreamWorkdir resource. */
class LogGetter {
  private logs: string | undefined;
  private error: any | undefined = undefined;

  private readonly change: ChangeSource = new ChangeSource();
  private readonly counter: CallersCounter = new CallersCounter();

  constructor(
    private readonly logger: MiLogger,
    private readonly clientLogs: ClientLogs,
    private readonly rInfo: ResourceInfo,
    private readonly lines: number,
    private readonly patternToSearch?: string
  ) {}

  getLog(): {
    log: string | undefined;
    error?: any | undefined;
  } {
    return {
      log: this.logs,
      error: this.error
    };
  }

  attach(w: Watcher, callerId: string) {
    this.change.attachWatcher(w);
    this.counter.inc(callerId);
  }

  release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }

  async update() {
    try {
      const resp = await this.clientLogs.lastLines(
        this.rInfo,
        this.lines,
        0n,
        this.patternToSearch
      );

      const newLogs = resp.data.toString();

      if (this.logs != newLogs) this.change.markChanged();
      this.logs = newLogs;
      this.error = undefined;

      return;
    } catch (e: any) {
      e as RpcError;
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        // No resource
        this.logs = '';
        this.error = e;
        this.change.markChanged();
        return;
      }

      this.logger.error(
        `Stream log lines for ${stringifyWithResourceId(this.rInfo.id)} failed, reason: ${e}`
      );
      throw e;
    }
  }
}

type ScheduledRefresh = {
  resolve: () => void;
  reject: (err: any) => void;
};
