import { WatchableValue, ObservableAccessor } from '../watchable_value';
import { test, expect } from '@jest/globals';

import { AccessorProvider, UsageGuard } from './accessor_provider';
import { Aborted, sleep } from '@milaboratories/ts-helpers';
import { Computable } from './computable';
import { ChangeSource } from '../change_source';
import { ComputableCtx } from './kernel';
import { PollingComputableHooks, StartStopComputableHooksOps } from './hooks_util';

class SynchronizedWatchableValue<T> implements AccessorProvider<ObservableAccessor<T>> {
  private readonly change = new ChangeSource();
  private readonly hooks: PollingComputableHooks;

  constructor(
    private readonly src: Computable<T>,
    private value: T,
    ops: StartStopComputableHooksOps
  ) {
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      ops
    );
  }

  private setValue(value: T): void {
    if (value === this.value) return;
    this.value = value;
    this.change.markChanged();
  }

  public getValue(ctx: ComputableCtx): T {
    ctx.attacheHooks(this.hooks);
    this.change.attachWatcher(ctx.watcher);
    return this.value;
  }

  public asComputable() {
    return Computable.make((ctx) => this.getValue(ctx));
  }

  createAccessor(ctx: ComputableCtx, guard: UsageGuard): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        ctx.attacheHooks(this.hooks);
        this.change.attachWatcher(ctx.watcher);
        return this.value;
      }
    } as ObservableAccessor<T>;
  }

  private schedulerAbort: (() => void) | undefined = undefined;

  public get active(): boolean {
    return this.schedulerAbort !== undefined;
  }

  private startUpdating(): void {
    const abort = new AbortController();

    // this.schedulerAbort in theory may still be defined but it is ok

    this.schedulerAbort = () => {
      abort.abort();
    };
    (async () => {
      try {
        while (true) {
          await this.src.awaitChange(abort.signal);
          this.setValue(await this.src.getValue());
        }
      } catch (err) {
        expect(err).toBeInstanceOf(Aborted);
      } finally {
        this.schedulerAbort = undefined;
      }
    })();
  }

  private stopUpdating(): void {
    if (this.schedulerAbort === undefined) throw new Error('Unexpected call.');
    this.schedulerAbort();
  }
}

function getTestSetups() {
  return [
    (() => {
      const observableSource = new WatchableValue(2);
      const synchronized = new SynchronizedWatchableValue(observableSource.asComputable(), 1, {
        stopDebounce: 10
      });
      const res2 = Computable.make((ctx) => synchronized.getValue(ctx) * 2);
      return { context: 'plain', observableSource, synchronized, res2 };
    })(),
    (() => {
      const observableSource = new WatchableValue(2);
      const synchronized = new SynchronizedWatchableValue(observableSource.asComputable(), 1, {
        stopDebounce: 10
      });
      const res1 = synchronized.asComputable();
      const res2 = Computable.make((ctx) => ({ r1: synchronized.getValue(ctx) }), {
        postprocessValue: ({ r1 }) => r1 * 2
      });
      return { context: 'nested', observableSource, synchronized, res2 };
    })()
  ];
}

test.each(getTestSetups())(
  'simple reactor test poll in $context context',
  async ({ observableSource, synchronized, res2 }) => {
    expect(synchronized.active).toEqual(false);
    expect(await res2.getValue()).toEqual(2);
    expect(synchronized.active).toEqual(true);
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(await res2.getValue()).toEqual(4);
    expect(synchronized.active).toEqual(true);
    observableSource.setValue(10);
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(await res2.getValue()).toEqual(20);
    expect(synchronized.active).toEqual(true);
    await sleep(20);
    expect(synchronized.active).toEqual(false);

    observableSource.setValue(20);
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(synchronized.active).toEqual(false);
    expect(await res2.getValue()).toEqual(20);
    expect(synchronized.active).toEqual(true);
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(await res2.getValue()).toEqual(40);
    expect(synchronized.active).toEqual(true);

    await res2.refreshState();
  }
);

// @todo unskip when migrating to vitest (revise the test code, remove timeouts)
test.skip.each(getTestSetups())(
  'simple reactor test listen in $context context',
  async ({ observableSource, synchronized, res2 }) => {
    expect(await res2.getValue()).toEqual(2);
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(await res2.getValue()).toEqual(4);

    // indefinite listener
    const listener1 = res2.awaitChange();
    await sleep(20);

    // still active
    expect(synchronized.active).toEqual(true);
    observableSource.setValue(10);
    await listener1;
    expect(await res2.getValue()).toEqual(20);
    await sleep(20);

    // now stopped
    expect(synchronized.active).toEqual(false);

    // indefinite listener
    const listener2 = res2.awaitChange(AbortSignal.timeout(10));
    await expect(listener2).rejects.toThrow(Aborted);
    expect(synchronized.active).toEqual(true);
    await sleep(20);
    expect(synchronized.active).toEqual(false);

    await res2.refreshState();
  }
);

// @todo unskip when migrating to vitest (revise the test code, remove timeouts)
test.skip.each(getTestSetups())(
  'simple reactor test pre-calculation in $context context',
  async ({ observableSource, synchronized, res2 }) => {
    res2 = res2.withPreCalculatedValueTree();
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(await res2.getValue()).toEqual(4);

    expect(synchronized.active).toEqual(true);
    await sleep(20);
    expect(synchronized.active).toEqual(false);

    res2 = res2.withPreCalculatedValueTree();

    expect(synchronized.active).toEqual(true);
    await sleep(20);
    expect(synchronized.active).toEqual(false);
  }
);
