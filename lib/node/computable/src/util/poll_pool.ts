import * as tp from 'node:timers/promises';
import { ConsoleLoggerAdapter, MiLogger } from '@milaboratories/ts-helpers';
import { ComputableHooks } from '../computable/computable_hooks';
import { Computable } from '../computable/computable';
import { ComputableCtx, UnwrapComputables } from '../computable/kernel';
import { HierarchicalWatcher } from '../hierarchical_watcher';
import { ChangeSource } from '../change_source';

export interface PollPoolOps {
  /** Minimal delay between subsequent polling cycles */
  minDelay: number;
}

type PollActorWrapper<A extends PollActor> = {
  readonly actor: WeakRef<A>;
  lastPauseRequest: symbol | undefined;
};

/**
 * Provides a building block to create joined pool of polling agent sharing the
 * same polling loop, and having simple individual on-off switches compatible with
 * computable logic.
 * */
export class PollPool<A extends PollActor = PollActor> {
  private readonly actors = new Map<string | symbol, PollActorWrapper<A>>();
  private readonly actorsMapChange = new ChangeSource();
  private readonly terminateController = new AbortController();
  private terminated: boolean = false;
  private readonly mainLoopHandle: Promise<void>;

  constructor(
    private readonly ops: PollPoolOps,
    private readonly logger: MiLogger = new ConsoleLoggerAdapter()
  ) {
    this.mainLoopHandle = this.mainLoop();
  }

  private async mainLoop() {
    while (true) {
      if (this.terminated) break;

      // select actors for this iteration and cleaning up the pool

      const activeActors = [];
      for (const [key, wrapper] of this.actors) {
        const actor = wrapper.actor.deref();
        if (actor === undefined) {
          this.actors.delete(key);
          continue;
        }

        // actor was collected by GC
        if (
          actor.pollPauseRequest !== undefined &&
          wrapper.lastPauseRequest === actor.pollPauseRequest
        )
          continue;

        // saving last pause request, to check if it remains the same on the next cycle
        wrapper.lastPauseRequest = actor.pollPauseRequest;

        activeActors.push(actor);
      }

      if (activeActors.length === 0) {
        const watcher = new HierarchicalWatcher();

        this.actorsMapChange.attachWatcher(watcher);
        for (const wrapper of this.actors.values()) {
          const actor = wrapper.actor.deref()!; // "!" because we performed cleanup above
          actor.pollPauseRequestChange.attachWatcher(watcher);
        }

        // awaiting at least one of the actors to change pause request
        try {
          await watcher.awaitChange(this.terminateController.signal);
        } catch (e) {
          // will terminate on next iteration
        }

        // initiate new loop
        continue;
      }

      // saving timestamp before we started polling actors, to estimate how long
      // of a delay we should add in the end to satisfy the min delay parameter
      const begin = Date.now();

      for (const actor of activeActors) {
        // prevent any errors from terminating the loop
        try {
          await actor.poll();
        } catch (e: unknown) {
          this.logger.error(e);
        }
      }

      if (this.terminated) break;

      try {
        const delay = Math.max(0, this.ops.minDelay - (Date.now() - begin));
        await tp.setTimeout(delay, undefined, { signal: this.terminateController.signal });
      } catch {}
    }
  }

  public createIfAbsent(key: string | symbol, factory: () => A): A {
    const wrapper = this.actors.get(key);
    if (wrapper !== undefined) {
      const actor = wrapper.actor.deref();
      if (actor !== undefined) return actor;

      // previous incarnation was collected by GC
      this.actors.delete(key);
    }
    const actor = factory();
    this.actors.set(key, { actor: new WeakRef<A>(actor), lastPauseRequest: undefined });
    this.actorsMapChange.markChanged();
    return actor;
  }

  public removeActor(key: string | symbol) {
    return this.actors.delete(key);
  }

  public add(actor: A): symbol {
    const key = Symbol();
    this.actors.set(key, { actor: new WeakRef<A>(actor), lastPauseRequest: undefined });
    this.actorsMapChange.markChanged();
    return key;
  }

  public async terminate(): Promise<void> {
    this.terminated = true;
    this.terminateController.abort();
    await this.mainLoopHandle;
  }
}

export interface PollActor {
  /** Do actors job */
  poll(): Promise<void>;

  /**
   * Poll pool will periodically call the actor if pollPauseRequest is undefined.
   *
   * Poll pool will not call the actor if its pollPauseRequest stays the same for
   * single polling iteration.
   *
   * Changing the pollPauseRequest to a new value guarantees that actor will be
   * called on the next polling cycle.
   * */
  readonly pollPauseRequest: symbol | undefined;

  /** Must report all pollPauseRequest value changes */
  readonly pollPauseRequestChange: ChangeSource;
}

type RefreshListener = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

class PollPoolPauseComputableAdapter implements ComputableHooks {
  // initiated in paused state, because nobody listen to us yet
  private _pollPauseRequest: symbol | undefined = Symbol();

  constructor() {}

  /** Return this in {@link PollActor.pollPauseRequest} */
  public get pollPauseRequest(): symbol | undefined {
    return this._pollPauseRequest;
  }

  public readonly pollPauseRequestChange = new ChangeSource();

  private refreshListeners: RefreshListener[] | undefined = undefined;

  /** (!) Must be called by the enclosing Computable before each poll operation */
  public retrieveRefreshListeners(): RefreshListener[] | undefined {
    if (this.refreshListeners === undefined) return undefined;
    const result = this.refreshListeners;
    this.refreshListeners = undefined;
    this.refreshPauseRequestIfNeeded();
    return result;
  }

  private refreshPauseRequestIfNeeded() {
    if (this.listening.size !== 0 || this.refreshListeners !== undefined) return;
    this._pollPauseRequest = Symbol();
    this.pollPauseRequestChange.markChanged();
  }

  public onChangedRequest(instance: Computable<unknown>): void {
    this.refreshPauseRequestIfNeeded();
  }

  public onGetValue(instance: Computable<unknown>): void {
    this.refreshPauseRequestIfNeeded();
  }

  private readonly listening = new Set<Computable<unknown>>();

  public onListenStart(instance: Computable<unknown>): void {
    this.listening.add(instance);
    this._pollPauseRequest = undefined;
    this.pollPauseRequestChange.markChanged();
  }

  public onListenStop(instance: Computable<unknown>): void {
    this.listening.delete(instance);
    this.refreshPauseRequestIfNeeded();
  }

  refreshState(instance: Computable<unknown>): Promise<void> {
    if (this.refreshListeners === undefined) this.refreshListeners = [];
    const result = new Promise<void>((resolve, reject) => {
      this.refreshListeners!.push({ resolve, reject });
    });
    this._pollPauseRequest = undefined;
    this.pollPauseRequestChange.markChanged();
    return result;
  }
}

interface PollComputablePoolEntry<Res> extends PollActor {
  readonly hooks: ComputableHooks;
  readonly value: Res | undefined;
  readonly change: ChangeSource;
}

export abstract class PollComputablePool<Req, Res> {
  private readonly pool: PollPool<PollComputablePoolEntry<Res>>;

  protected constructor(
    ops: PollPoolOps,
    private readonly logger: MiLogger = new ConsoleLoggerAdapter()
  ) {
    this.pool = new PollPool(ops, logger);
  }

  /** Constructs a key to identify similar requests */
  protected abstract getKey(req: Req): string;

  /** Reads the target value, main method executed in polling loop */
  protected abstract readValue(req: Req): Promise<Res> | Res;

  /** Method to compare current and previous values, to prevent redundant
   * change signals */
  protected abstract resultsEqual(res1: Res, res2: Res): boolean;

  private createEntry(req: Req): PollComputablePoolEntry<Res> {
    const watcher = new HierarchicalWatcher();
    const parent = this;
    return new (class implements PollComputablePoolEntry<Res> {
      value: Res | undefined = undefined;
      readonly change = new ChangeSource();

      readonly hooks = new PollPoolPauseComputableAdapter();

      get pollPauseRequest(): symbol | undefined {
        return this.hooks.pollPauseRequest;
      }

      get pollPauseRequestChange(): ChangeSource {
        return this.hooks.pollPauseRequestChange;
      }

      async poll(): Promise<void> {
        const listeners = this.hooks.retrieveRefreshListeners();
        try {
          const newValue = await parent.readValue(req);
          if (
            !(newValue === undefined && this.value === undefined) &&
            (newValue === undefined ||
              this.value === undefined ||
              !parent.resultsEqual(this.value, newValue))
          ) {
            this.value = newValue;
            this.change.markChanged();
          }
        } catch (e: unknown) {
          if (listeners !== undefined) for (const listener of listeners) listener.reject(e);
          throw e;
        }

        if (listeners !== undefined) for (const listener of listeners) listener.resolve();
      }
    })();
  }

  public get(req: Req, ctx: ComputableCtx): Res | undefined;
  public get(req: Req): Computable<UnwrapComputables<Res> | undefined>;
  public get(
    req: Req,
    ctx?: ComputableCtx
  ): (Res | undefined) | Computable<UnwrapComputables<Res> | undefined> {
    if (ctx === undefined) return Computable.make((ctx1) => this.get(req, ctx1));

    const key = this.getKey(req);
    const entry = this.pool.createIfAbsent(key, () => this.createEntry(req));
    ctx.attacheHooks(entry.hooks);
    entry.change.attachWatcher(ctx.watcher);

    return entry.value;
  }

  public async terminate() {
    await this.pool.terminate();
  }
}