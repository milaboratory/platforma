import { ChangeSource, ComputableCtx, TrackedAccessorProvider, UsageGuard, Watcher } from '@milaboratory/computable';
import { ResourceId } from '@milaboratory/pl-client-v2';
import { CallersCounter, mapGet } from '@milaboratory/ts-helpers';
import { StreamingAPI_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import { ClientLogs } from '../clients/logs';
import { randomUUID } from 'node:crypto';
import { ResourceInfo } from '../clients/helpers';
import { LongUpdater } from './helpers';

export interface LogsSyncReader {
  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getLastLogs(
    w: Watcher,
    { id, type }: ResourceInfo,
    lines: number,
    callerId: string,
  ): LogResult;

  /** Returns a last line that has patternToSearch.
   * Notifies when a new line appeared or EOF reached. */
  getProgressLog(
    w: Watcher,
    { id, type }: ResourceInfo,
    patternToSearch: string,
    callerId: string,
  ): LogResult;

  /** Returns an Id of a smart object, that can read logs directly from
   * the platform. */
  getLogId(
    w: Watcher,
    { id, type }: ResourceInfo,
    callerId: string,
  ): LogId | undefined;
}

export interface LogResult {
  log: string;
}

export interface LogId {
  readonly id: string;
  readonly rInfo: ResourceInfo;
}

export interface LogsAsyncReader {
  getLog(logId: LogId): Log;
}

export interface Log {
  lastLines(
    lineCount: number,
    offsetBytes: bigint, // if 0n, then start from the end.
    searchStr?: string,
  ): Promise<StreamingAPI_Response | undefined>;

  readText(
    lineCount: number,
    offsetBytes: bigint, // if 0n, then start from the beginning.
    searchStr?: string,
  ): Promise<StreamingAPI_Response | undefined>;
}

/** Call this methods on destroy of the caller (e.g. the cell). */
export interface LogsDestroyer {
  releaseLastLogs(rId: ResourceId, callerId: string): Promise<void>;
  releaseProgressLog(rId: ResourceId, callerId: string): Promise<void>;
  releaseLogId(rId: ResourceId, callerId: string): Promise<void>;
}

/** Just binds a watcher to a LogsSyncReader. */
export class LogsSyncAccessor {
  constructor(
    private readonly w: Watcher,
    private readonly ctx: ComputableCtx,
    private readonly reader: LogsSyncReader,
  ) {}

  getLastLogs(
    rInfo: ResourceInfo,
    lines: number,
    callerId: string,
  ): LogResult {
    const logs = this.reader.getLastLogs(this.w, rInfo, lines, callerId);
    this.unstableIfNotEmpty(logs);
    return logs;
  }

  getProgressLog(
    rInfo: ResourceInfo,
    patternToSearch: string,
    callerId: string,
  ): LogResult {
    const logs = this.reader.getProgressLog(this.w, rInfo, patternToSearch, callerId);
    this.unstableIfNotEmpty(logs);
    return logs;
  }

  getLogId(
    rInfo: ResourceInfo,
    callerId: string,
  ): LogId | undefined {
    return this.reader.getLogId(this.w, rInfo, callerId);
  }

  private unstableIfNotEmpty(logs: LogResult) {
    if (logs.log == '')
      this.ctx.markUnstable();
  }
}

/** Holds a queue of downloading tasks,
 * and notifies every watcher when a file were downloaded. */
export class LogsDriver implements
TrackedAccessorProvider<LogsSyncAccessor>,
LogsSyncReader,
LogsAsyncReader,
LogsDestroyer {
  /** Holds a map of StreamManager Resource Id to all logs of this stream. */
  private readonly idToLastLines: Map<ResourceId, LastLinesGetter> = new Map();

  /** Holds a map of StreamManager Resource Id to the last log line of this stream. */
  private readonly idToProgressLog: Map<ResourceId, LastLinesGetter> = new Map();

  /** Holds a map of StreamManager Resource Id to log id smart object. */
  private readonly idToLogId: Map<ResourceId, string> = new Map();
  private readonly logIdToLog: Map<string, LogIdGetter> = new Map();

  constructor(
    private readonly clientLogs: ClientLogs,
  ) {
  }

  createInstance(watcher: Watcher, _: UsageGuard, ctx: ComputableCtx): LogsSyncAccessor {
    return new LogsSyncAccessor(watcher, ctx, this);
  }

  getLastLogs(
    w: Watcher,
    rInfo: ResourceInfo,
    lines: number,
    callerId: string,
  ): LogResult {
    const logGetter = this.idToLastLines.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(this.clientLogs, rInfo, lines);
      this.idToLastLines.set(rInfo.id, newLogGetter);
      const result = newLogGetter.getOrSchedule(w, callerId);

      if (result.error != undefined)
        return {log: ''};

      return result;
    }

    const result = logGetter.getOrSchedule(w, callerId);
    if (result.error != undefined)
      throw result.error;

    return result;
  }

  getProgressLog(
    w: Watcher,
    rInfo: ResourceInfo,
    patternToSearch: string,
    callerId: string,
  ): LogResult {
    const logGetter = this.idToProgressLog.get(rInfo.id);

    if (logGetter == undefined) {
      const newLogGetter = new LastLinesGetter(
        this.clientLogs, rInfo, 1, patternToSearch,
      );
      this.idToProgressLog.set(rInfo.id, newLogGetter);
      return newLogGetter.getOrSchedule(w, callerId);
    }

    return logGetter.getOrSchedule(w, callerId);
  }

  getLogId(
    _: Watcher,
    rInfo: ResourceInfo,
    callerId: string,
  ): LogId {
    const logId = this.idToLogId.get(rInfo.id);

    if (logId == undefined) {
      const newLogGetter = new LogIdGetter(this.clientLogs);
      const newId = newLogGetter.getId(callerId);
      this.idToLogId.set(rInfo.id, newId);
      this.logIdToLog.set(newId, newLogGetter)

      return { id: newId, rInfo }
    }

    return { id: logId, rInfo };
  }

  getLog(logId: LogId): Log {
    return mapGet(this.logIdToLog, logId.id).getLog(logId);
  }

  async releaseLastLogs(rId: ResourceId, callerId: string) {
    const deleted = this.idToLastLines.get(rId)?.release(callerId);
    if (deleted)
      this.idToLastLines.delete(rId);
  }

  async releaseProgressLog(rId: ResourceId, callerId: string) {
    const deleted = this.idToProgressLog.get(rId)?.release(callerId);
    if (deleted)
      this.idToProgressLog.delete(rId);
  }

  async releaseLogId(rId: ResourceId, callerId: string) {
    const logId = this.idToLogId.get(rId);
    if (logId == undefined) {
      return;
    }

    const deleted = this.logIdToLog.get(logId)?.release(callerId);
    if (deleted) {
      this.idToLogId.delete(rId);
      this.logIdToLog.delete(logId);
    }
  }

  async releaseAll() {}
}

/** A job that gets last lines from a StreamWorkdir resource. */
class LastLinesGetter {
  private updater: LongUpdater;
  private logs: string = "";
  private readonly change: ChangeSource = new ChangeSource();
  private readonly counter: CallersCounter = new CallersCounter();
  private error: any | undefined = undefined;

  constructor(
    private readonly clientLogs: ClientLogs,
    private readonly rInfo: ResourceInfo,
    private readonly lines: number,
    private readonly patternToSearch?: string,
    sleepMs = 1000,
  ) {
    this.updater = new LongUpdater(
      async () => this.update(),
      sleepMs,
    )
  }

  getOrSchedule(w: Watcher, callerId: string): LogResult & {error?: any} {
    this.counter.inc(callerId);
    this.change.attachWatcher(w);

    this.updater.schedule();

    return {
      log: this.logs,
      error: this.error,
    };
  }

  release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }

  async update() {
    try {
      const resp = await this.clientLogs.lastLines(
        this.rInfo, this.lines, 0n, this.patternToSearch,
      );

      const newLogs = resp.data.toString();

      if (this.logs != newLogs)
        this.change.markChanged();
      this.logs = newLogs;

      return true;
    } catch (e: any) {
      if (e.name == 'RpcError' && e.code == 'NOT_FOUND') {
        // No resource
        this.logs = '';
        this.error = e;
        this.change.markChanged();
        return true;
      }

      throw e;
    }
  }
}

/** Just a wrapper with a counter that returns an access to proto driver. */
class LogIdGetter {
  private readonly id = randomUUID();
  private readonly counter: CallersCounter = new CallersCounter();

  constructor(
    private readonly clientLogs: ClientLogs,
  ) {}

  getId(
    callerId: string,
  ) {
    this.counter.inc(callerId);
    return this.id;
  }

  getLog({ rInfo }: LogId): Log {
    return {
      lastLines: async (
        lineCount: number,
        offsetBytes: bigint,
        searchStr?: string,
      ) => this.clientLogs.lastLines(rInfo, lineCount, offsetBytes, searchStr),

      readText: async (
        lineCount: number,
        offsetBytes: bigint, // if 0n, then start from the beginning.
        searchStr?: string,
      ) => this.clientLogs.readText(rInfo, lineCount, offsetBytes, searchStr),
    }
  }

  release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }
}
