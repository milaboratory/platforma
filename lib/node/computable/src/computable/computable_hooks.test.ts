import { WatchableValue, ObservableAccessor } from '../watchable_value';

import { TrackedAccessorProvider, UsageGuard } from './accessor_provider';
import { Aborted, sleep } from '@milaboratory/ts-helpers';
import { Computable } from './computable';
import { computable } from './computable_helpers';
import { ChangeSource } from '../change_source';
import { Watcher } from '../watcher';
import { ComputableCtx } from './kernel';
import { PollingComputableHooks, StartStopComputableHooksOps } from './hooks_util';

class SynchronizedWatchableValue<T> implements TrackedAccessorProvider<ObservableAccessor<T>> {
  private readonly change = new ChangeSource();
  private readonly hooks: PollingComputableHooks;

  constructor(private readonly src: Computable<T>, private value: T, ops: StartStopComputableHooksOps) {
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      ops);
  }

  private setValue(value: T): void {
    if (value === this.value)
      return;
    this.value = value;
    this.change.markChanged();
  }

  createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        ctx.attacheHooks(this.hooks);
        this.change.attachWatcher(watcher);
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
          await this.src.listen(abort.signal);
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
    if (this.schedulerAbort === undefined)
      throw new Error('Unexpected call.');
    this.schedulerAbort();
  }
}

function getTestSetups() {
  return [
    (() => {
      const observableSource = new WatchableValue(2);
      const synchronized = new SynchronizedWatchableValue(
        computable(observableSource, {}, a => a.getValue()),
        1, { stopDebounce: 10 });
      const res2 = computable(synchronized, {},
        a => a.getValue() * 2);
      return { context: 'plain', observableSource, synchronized, res2 };
    })(),
    (() => {
      const observableSource = new WatchableValue(2);
      const synchronized = new SynchronizedWatchableValue(
        computable(observableSource, {}, a => a.getValue()),
        1, { stopDebounce: 10 });
      const res1 = computable(synchronized, {},
        a => a.getValue());
      const res2 = computable(synchronized, {},
        a => ({ r1: res1 }), async ({ r1 }) => r1 * 2);
      return { context: 'nested', observableSource, synchronized, res2 };
    })()
  ];
}

test.each(getTestSetups())
('simple reactor test poll in $context context', async ({ observableSource, synchronized, res2 }) => {
  expect(synchronized.active).toEqual(false);
  expect(await res2.getValue()).toEqual(2);
  expect(synchronized.active).toEqual(true);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(4);
  expect(synchronized.active).toEqual(true);
  observableSource.setValue(10);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(20);
  expect(synchronized.active).toEqual(true);
  await sleep(20);
  expect(synchronized.active).toEqual(false);

  observableSource.setValue(20);
  await new Promise(resolve => setImmediate(resolve));
  expect(synchronized.active).toEqual(false);
  expect(await res2.getValue()).toEqual(20);
  expect(synchronized.active).toEqual(true);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(40);
  expect(synchronized.active).toEqual(true);

  await res2.refreshState();
});

test.each(getTestSetups())
('simple reactor test listen in $context context', async ({ observableSource, synchronized, res2 }) => {

  expect(await res2.getValue()).toEqual(2);
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(4);

  // indefinite listener
  const listener1 = res2.listen();
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
  const listener2 = res2.listen(AbortSignal.timeout(10));
  await expect(listener2).rejects.toThrow(Aborted);
  expect(synchronized.active).toEqual(true);
  await sleep(20);
  expect(synchronized.active).toEqual(false);

  await res2.refreshState();
});

test.each(getTestSetups())
('simple reactor test pre-calculation in $context context', async ({ observableSource, synchronized, res2 }) => {
  res2.preCalculateValueTree();
  await new Promise(resolve => setImmediate(resolve));
  expect(await res2.getValue()).toEqual(4);

  expect(synchronized.active).toEqual(true);
  await sleep(20);
  expect(synchronized.active).toEqual(false);

  res2.preCalculateValueTree();

  expect(synchronized.active).toEqual(true);
  await sleep(20);
  expect(synchronized.active).toEqual(false);
});
