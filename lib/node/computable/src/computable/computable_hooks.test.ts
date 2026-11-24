import { WatchableValue, ObservableAccessor } from "../watchable_value";
import { test, expect } from "vitest";

import { AccessorProvider, UsageGuard } from "./accessor_provider";
import { Aborted, sleep } from "@milaboratories/ts-helpers";
import { Computable } from "./computable";
import { ChangeSource } from "../change_source";
import { ComputableCtx } from "./kernel";
import { PollingComputableHooks, StartStopComputableHooksOps } from "./hooks_util";

class SynchronizedWatchableValue<T> implements AccessorProvider<ObservableAccessor<T>> {
  private readonly change = new ChangeSource();
  private readonly hooks: PollingComputableHooks;

  constructor(
    private readonly src: Computable<T>,
    private value: T,
    ops: StartStopComputableHooksOps,
  ) {
    this.hooks = new PollingComputableHooks(
      () => this.startUpdating(),
      () => this.stopUpdating(),
      ops,
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
      },
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
    if (this.schedulerAbort === undefined) throw new Error("Unexpected call.");
    this.schedulerAbort();
  }
}

function getTestSetups() {
  return [
    (() => {
      const observableSource = new WatchableValue(2);
      const synchronized = new SynchronizedWatchableValue(observableSource.asComputable(), 1, {
        stopDebounce: 10,
      });
      const res2 = Computable.make((ctx) => synchronized.getValue(ctx) * 2);
      return { context: "plain", observableSource, synchronized, res2 };
    })(),
    (() => {
      const observableSource = new WatchableValue(2);
      const synchronized = new SynchronizedWatchableValue(observableSource.asComputable(), 1, {
        stopDebounce: 10,
      });
      const _res1 = synchronized.asComputable();
      const res2 = Computable.make((_ctx) => ({ r1: synchronized.getValue(_ctx) }), {
        postprocessValue: ({ r1 }) => r1 * 2,
      });
      return { context: "nested", observableSource, synchronized, res2 };
    })(),
  ];
}

test.each(getTestSetups())(
  "simple reactor test poll in $context context",
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
  },
);

// @todo unskip when migrating to vitest (revise the test code, remove timeouts)
test.skip.each(getTestSetups())(
  "simple reactor test listen in $context context",
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
  },
);

// @todo unskip when migrating to vitest (revise the test code, remove timeouts)
test.skip.each(getTestSetups())(
  "simple reactor test pre-calculation in $context context",
  async ({ observableSource: _observableSource, synchronized, res2 }) => {
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
  },
);

test.each(getTestSetups())(
  "a passive read and a passive wait do not start the source in $context context",
  async ({ observableSource, synchronized, res2 }) => {
    expect(await res2.getValuePassively()).toEqual(2);
    expect(synchronized.active).toEqual(false);

    const abort = new AbortController();
    const wait = res2.awaitChangePassively({ signal: abort.signal });
    observableSource.setValue(10);
    await sleep(20);
    expect(synchronized.active).toEqual(false);

    abort.abort();
    await expect(wait).rejects.toThrow();
    expect(synchronized.active).toEqual(false);
  },
);

test.each(getTestSetups())(
  "a passive wait resolves when an active reader brings a change in $context context",
  async ({ observableSource, synchronized, res2 }) => {
    expect(await res2.getValue()).toEqual(2);
    expect(synchronized.active).toEqual(true);

    // the active read above refreshes the source, which changes the value
    await res2.awaitChangePassively({ signal: AbortSignal.timeout(1000) });
    expect(await res2.getValuePassively()).toEqual(4);

    const wait = res2.awaitChangePassively({ signal: AbortSignal.timeout(1000) });
    observableSource.setValue(10);
    // keeps the source refreshing, as another listener would
    expect(await res2.getValue()).toEqual(4);
    await wait;
    expect(await res2.getValuePassively()).toEqual(20);
  },
);

test.each(getTestSetups())(
  "a passive reader does not keep a changing source refreshing after the last active reader leaves in $context context",
  async ({ observableSource, synchronized, res2 }) => {
    expect(await res2.getValue()).toEqual(2);
    expect(synchronized.active).toEqual(true);

    const abort = new AbortController();
    let passiveReads = 0;
    const reader = (async () => {
      try {
        while (true) {
          await res2.awaitChangePassively({ signal: abort.signal });
          await res2.getValuePassively();
          passiveReads++;
        }
      } catch {
        // aborted
      }
    })();

    let v = 3;
    const changer = setInterval(() => observableSource.setValue(v++), 2);
    try {
      // stopDebounce is 10 ms
      await sleep(50);
      expect(synchronized.active).toEqual(false);
      expect(passiveReads).toBeGreaterThan(0);

      const readsWhenStopped = passiveReads;
      await sleep(30);
      expect(synchronized.active).toEqual(false);
      expect(passiveReads).toEqual(readsWhenStopped);
    } finally {
      clearInterval(changer);
      abort.abort();
      await reader;
    }
  },
);
