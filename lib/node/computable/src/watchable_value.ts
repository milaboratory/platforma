import { ChangeSource } from './change_source';
import { AccessorProvider, TrackedAccessorProvider, UsageGuard } from './computable/accessor_provider';
import { Watcher } from './watcher';
import { ComputableCtx } from './computable/kernel';

export interface ObservableAccessor<T> {
  getValue(): T;
}

/** Super primitive observable implementation */
export class WatchableValue<T> implements TrackedAccessorProvider<ObservableAccessor<T>>, AccessorProvider<ObservableAccessor<T>> {
  private readonly change = new ChangeSource();

  constructor(private value: T) {
  }

  public setValue(value: T): void {
    this.value = value;
    this.change.markChanged();
  }

  createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        this.change.attachWatcher(watcher);
        return this.value;
      }
    } as ObservableAccessor<T>;
  }

  createAccessor(ctx: ComputableCtx, guard: UsageGuard): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        this.change.attachWatcher(ctx.watcher);
        return this.value;
      }
    };
  }
}
