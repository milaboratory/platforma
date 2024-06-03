import { ChangeSource, TrackedAccessorProvider, Watcher } from '@milaboratory/computable';
import { BasicResourceData, PlClient, ResourceId, ResourceType, getField, isNullResourceId, valErr } from '@milaboratory/pl-client-v2';
import { CallersCounter, mapGet } from '@milaboratory/ts-helpers';
import { StreamingAPI_Response } from '../proto/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol';
import { ClientLogs } from '../clients/logs';
import { scheduler } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';

export interface LogsSyncReader {
  /** Returns all logs and schedules a job that reads remain logs.
   * Notifies when a new portion of the log appeared. */
  getAllLogs(
    w: Watcher,
    streamManagerId: ResourceId,
    callerId: string,
  ): LogResult;

  /** Returns a last line that has patternToSearch.
   * Notifies when a new line appeared or EOF reached. */
  getProgressLog(
    w: Watcher,
    streamManagerId: ResourceId,
    patternToSearch: string,
    callerId: string,
  ): LogResult;

  /** Returns an Id of a smart object, that can read logs directly from
   * the platform. */
  getLogId(
    streamManagerId: ResourceId,
    callerId: string,
  ): string;
}

export interface LogResult {
  log: string;
  done: boolean;
}

export interface LogsAsyncReader {
  getLog(logId: string): Log;
}

export interface Log {
  lastLines: (
    lineCount: number,
    offsetBytes: bigint, // if 0n, then start from the end.
    searchStr?: string,
  ) => Promise<StreamingAPI_Response | undefined>;

  readText: (
    lineCount: number,
    offsetBytes: bigint, // if 0n, then start from the beginning.
    searchStr?: string,
  ) => Promise<StreamingAPI_Response | undefined>;
}

/** Call this methods on destroy of the caller (e.g. the cell). */
export interface LogsDestroyer {
  releaseAllLogs(rId: ResourceId, callerId: string): Promise<void>;
  releaseProgressLog(rId: ResourceId, callerId: string): Promise<void>;
  releaseLogId(rId: ResourceId, callerId: string): Promise<void>;
}

/** Just binds a watcher to a LogsSyncReader. */
export class LogsSyncAccessor {
  constructor(
    private readonly w: Watcher,
    private readonly reader: LogsSyncReader
  ) {}

  getAllLogs(
    streamManagerId: ResourceId,
    callerId: string,
  ): LogResult {
    return this.reader.getAllLogs(this.w, streamManagerId, callerId);
  }

  getProgressLog(
    streamManagerId: ResourceId,
    patternToSearch: string,
    callerId: string,
  ): LogResult {
    return this.reader.getProgressLog(this.w, streamManagerId, patternToSearch, callerId);
  }

  getLogId(
    streamManagerId: ResourceId,
    callerId: string,
  ): string {
    return this.reader.getLogId(streamManagerId, callerId);
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
  private smIdToAllLogs: Map<ResourceId, AllLogsGetter> = new Map();

  /** Holds a map of StreamManager Resource Id to the last log line of this stream. */
  private smIdToProgressLog: Map<ResourceId, ProgressLogGetter> = new Map();

  /** Holds a map of StreamManager Resource Id to log id smart object. */
  private smIdToLogId: Map<ResourceId, string> = new Map();
  private logIdToLog: Map<string, LogIdGetter> = new Map();

  constructor(
    private readonly client: PlClient,
    private readonly clientLogs: ClientLogs,
  ) {
  }

  createInstance(watcher: Watcher): LogsSyncAccessor {
    return new LogsSyncAccessor(watcher, this);
  }

  getAllLogs(
    w: Watcher,
    streamManagerId: ResourceId,
    callerId: string,
  ): LogResult {
    const logGetter = this.smIdToAllLogs.get(streamManagerId);

    if (logGetter == undefined) {
      const newLogGetter = new AllLogsGetter(this.client, this.clientLogs, streamManagerId);
      this.smIdToAllLogs.set(streamManagerId, newLogGetter);
      return newLogGetter.getOrSchedule(w, callerId);
    }

    return logGetter.getOrSchedule(w, callerId);
  }

  getProgressLog(
    w: Watcher,
    streamManagerId: ResourceId,
    patternToSearch: string,
    callerId: string,
  ): LogResult {
    const logGetter = this.smIdToProgressLog.get(streamManagerId);

    if (logGetter == undefined) {
      const newLogGetter = new ProgressLogGetter(this.client, this.clientLogs, streamManagerId, patternToSearch);
      this.smIdToProgressLog.set(streamManagerId, newLogGetter);
      return newLogGetter.getOrSchedule(w, callerId);
    }

    return logGetter.getOrSchedule(w, callerId);
  }

  getLogId(
    streamManagerId: ResourceId,
    callerId: string,
  ): string {
    const logId = this.smIdToLogId.get(streamManagerId);

    if (logId == undefined) {
      const newLogGetter = new LogIdGetter(this.client, this.clientLogs, streamManagerId);
      const newId = newLogGetter.getId(callerId);
      this.smIdToLogId.set(streamManagerId, newId);
      this.logIdToLog.set(newId, newLogGetter)

      return newId;
    }

    return logId;
  }

  getLog(logId: string): Log {
    return mapGet(this.logIdToLog, logId).getLog();
  }

  async releaseAllLogs(rId: ResourceId, callerId: string) {
    const deleted = this.smIdToAllLogs.get(rId)?.release(callerId);
    if (deleted)
      this.smIdToAllLogs.delete(rId);
  }

  async releaseProgressLog(rId: ResourceId, callerId: string) {
    const deleted = this.smIdToProgressLog.get(rId)?.release(callerId);
    if (deleted)
      this.smIdToProgressLog.delete(rId);
  }

  async releaseLogId(rId: ResourceId, callerId: string) {
    const logId = this.smIdToLogId.get(rId);
    if (logId == undefined) {
      return;
    }

    const deleted = this.logIdToLog.get(logId)?.release(callerId);
    if (deleted) {
      this.smIdToLogId.delete(rId);
      this.logIdToLog.delete(logId);
    }
  }

  async releaseAll() {}
}

const DEFAULT_N_LINES_PER_READ = 10;

class AllLogsGetter {
  private updater: LongUpdater;
  private logs: string[] = [];
  private offset: bigint = 0n;
  private readonly change: ChangeSource = new ChangeSource();
  private readonly counter: CallersCounter = new CallersCounter();
  private done: boolean = false;

  constructor(
    private readonly client: PlClient,
    private readonly clientLogs: ClientLogs,
    private readonly streamManagerId: ResourceId,
    private readonly nLinesPerRead = DEFAULT_N_LINES_PER_READ,
    sleepMs = 1000,
  ) {
    this.updater = new LongUpdater(
      async () => this.readUntilStop(),
      sleepMs,
    )
  }

  getOrSchedule(w: Watcher, callerId: string): LogResult {
    this.counter.inc(callerId);
    this.change.attachWatcher(w);

    this.updater.schedule();

    return {
      log: this.logs.join(''),
      done: this.done,
    };
  }

  release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }

  async readUntilStop() {
    for (let size = this.offset + 1n; this.offset < size;) {
      
      const stream = await getStream(this.client, this.streamManagerId);
      if (stream == undefined)
        break;

      const resp = await this.clientLogs.readText(
        stream, this.nLinesPerRead, this.offset,
      )

      this.offset = resp.newOffset;
      size = resp.size;

      this.done = isLogDone(stream.type, this.offset, size);

      if (resp.data.toString().length > 0 || this.done) {
        this.logs.push(resp.data.toString());
        this.change.markChanged();
      }
    }

    return this.done;
  }
}

class ProgressLogGetter {
  private updater: LongUpdater;
  private line: string = "";
  private readonly change: ChangeSource = new ChangeSource();
  private readonly counter: CallersCounter = new CallersCounter();
  private done: boolean = false;

  constructor(
    private readonly client: PlClient,
    private readonly clientLogs: ClientLogs,
    private readonly streamManagerId: ResourceId,
    private readonly patternToSearch: string,
    sleepMs: number = 1000,
  ) {
    this.updater = new LongUpdater(
      async () => this.getLastLogLine(),
      sleepMs,
    );
  }

  getOrSchedule(
    w: Watcher,
    callerId: string,
  ): LogResult {
    this.counter.inc(callerId);
    this.change.attachWatcher(w);

    this.updater.schedule();

    return {
      log: this.line,
      done: this.done,
    }
  }

  release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }

  async getLastLogLine() {
    const stream = await getStream(this.client, this.streamManagerId);
    if (stream == undefined) {
      return this.done;
    }

    const resp = await this.clientLogs.lastLines(
      stream, 1, 0n, this.patternToSearch,
    )
    const newLine = resp.data.toString();
    this.done = isLogDone(stream.type, 0n, 0n);

    if (this.line != newLine || this.done)
      this.change.markChanged();

    this.line = newLine;

    return this.done;
  }
}

/** It's an Updater but for tasks that happens in a while loop with sleeping between. */
class LongUpdater {
  private updater: Updater;

  constructor(
    private readonly onUpdate: () => Promise<boolean>,
    private readonly sleepMs: number,
  ) {
    this.updater = new Updater(
      async () => {
        while (true) {
          const done = await this.onUpdate();
          if (done)
            return
          await scheduler.wait(this.sleepMs);
        }
      }
    )
  }

  schedule = () => this.updater.schedule();
}

/** Updater incorporates a pattern when someone wants to run a callback
 * that updates something only when it's not already running. */
class Updater {
  private updating: Promise<void> | undefined;

  constructor(private readonly onUpdate: () => Promise<void>) {}

  schedule() {
    if (this.updating == undefined) {
      this.updating = (async () => {
        try {
          await this.onUpdate();
        } catch (e) {
          console.log(`error while updating in Updater: ${e}`)
        } finally {
          this.updating = undefined;
        }
      })()
    }
  }
}

class LogIdGetter {
  private readonly id = randomUUID();
  private readonly counter: CallersCounter = new CallersCounter();

  constructor(
    private readonly client: PlClient,
    private readonly clientLogs: ClientLogs,
    private readonly streamManagerId: ResourceId,
  ) {}

  getId(
    callerId: string,
  ) {
    this.counter.inc(callerId);
    return this.id;
  }

  getLog(): Log {
    return {
      lastLines: async (
        lineCount: number,
        offsetBytes: bigint,
        searchStr?: string,
      ) => {
        const stream = await getStream(this.client, this.streamManagerId);
        if (stream == undefined)
          return undefined;

        return await this.clientLogs.lastLines(stream, lineCount, offsetBytes, searchStr)
      },

      readText: async (
        lineCount: number,
        offsetBytes: bigint, // if 0n, then start from the beginning.
        searchStr?: string,
      ) => {
        const stream = await getStream(this.client, this.streamManagerId);
        if (stream == undefined)
          return undefined;

        return this.clientLogs.readText(stream, lineCount, offsetBytes, searchStr);
      }
    }
  }

  release(callerId: string): boolean {
    return this.counter.dec(callerId);
  }
}

async function getStream(client: PlClient, streamManagerId: ResourceId): Promise<BasicResourceData | undefined> {
  return client.withReadTx("LogsDriverGetStream", async (tx) => {
    const sm = await tx.getResourceData(streamManagerId, true);
    const stream = await valErr(tx, getField(sm, 'stream'));
    if (stream.error != '') {
      throw new Error(`while getting stream: ${stream.error}`);
    }
    if (isNullResourceId(stream.valueId))
      return undefined;

    return await tx.getResourceData(stream.valueId, false);
  })
}

function isLogDone(rType: ResourceType, offset: bigint, size: bigint): boolean {
  return !rType.name.startsWith('StreamWorkdir') && offset == size;
}
