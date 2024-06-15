import { ChangeSource } from './change_source';
import { AccessorProvider, UsageGuard } from './computable/accessor_provider';
import { Watcher } from './watcher';
import { ComputableCtx } from './computable/kernel';
import { Computable } from './computable/computable';

export interface ObservableAccessor<T> {
  getValue(): T;
}

/** Super primitive observable implementation */
export class WatchableValue<T> implements AccessorProvider<ObservableAccessor<T>> {
  private readonly change = new ChangeSource();

  constructor(private value: T) {
  }

  public setValue(value: T): void {
    this.value = value;
    this.change.markChanged();
  }

  public getValue(ctx: ComputableCtx): T {
    this.change.attachWatcher(ctx.watcher);
    return this.value;
  }

  public asComputable() {
    return Computable.make(ctx => this.getValue(ctx));
  }

  public createInstance(watcher: Watcher, guard: UsageGuard, ctx: ComputableCtx): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        return this.getValue(ctx);
      }
    };
  }

  public createAccessor(ctx: ComputableCtx, guard: UsageGuard): ObservableAccessor<T> {
    return {
      getValue: () => {
        guard();
        return this.getValue(ctx);
      }
    };
  }
}
