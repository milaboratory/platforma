import { ChangeSource } from './change_source';
import type { AccessorProvider, UsageGuard } from './computable/accessor_provider';
import type { Watcher } from './watcher';
import type { ComputableCtx } from './computable/kernel';
import { Computable } from './computable/computable';

export interface ObservableAccessor<T> {
  getValue(): T;
}

/** Super primitive observable implementation */
export class WatchableValue<T> implements AccessorProvider<ObservableAccessor<T>> {
  private readonly key: symbol = Symbol();
  private readonly change = new ChangeSource();

  constructor(private value: T) {}

  public setValue(value: T, marker?: string): void {
    this.value = value;
    this.change.markChanged(marker);
  }

  public getValue(ctx: ComputableCtx): T {
    this.change.attachWatcher(ctx.watcher);
    return this.value;
  }

  public asComputable() {
    return Computable.make((ctx) => this.getValue(ctx), { key: this.key });
  }

  public createInstance(
    watcher: Watcher,
    guard: UsageGuard,
    ctx: ComputableCtx,
  ): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        return this.getValue(ctx);
      },
    };
  }

  public createAccessor(ctx: ComputableCtx, guard: UsageGuard): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        return this.getValue(ctx);
      },
    };
  }
}
