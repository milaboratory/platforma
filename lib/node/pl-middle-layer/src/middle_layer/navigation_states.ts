import { ChangeSource, Computable, ComputableCtx } from '@milaboratories/computable';
import { NavigationState, DefaultNavigationState } from '@platforma-sdk/model';

type NavigationStateEntry = {
  state: NavigationState;
  readonly change: ChangeSource;
};

export class NavigationStates {
  private readonly states = new Map<string, NavigationStateEntry>();

  public setState(blockId: string, state: NavigationState) {
    const entry = this.states.get(blockId);
    if (entry === undefined) {
      this.states.set(blockId, { state, change: new ChangeSource() });
      return;
    }
    entry.state = { ...state };
    entry.change.markChanged();
  }

  private readState(ctx: ComputableCtx, blockId: string): NavigationState {
    let entry = this.states.get(blockId);
    if (entry === undefined) {
      entry = { state: { ...DefaultNavigationState }, change: new ChangeSource() };
      this.states.set(blockId, entry);
    }
    entry.change.attachWatcher(ctx.watcher);
    return entry.state;
  }

  public getState(blockId: string): Computable<NavigationState> {
    return Computable.make(
      (ctx) => {
        return this.readState(ctx, blockId);
      },
      { key: `navigationState#${blockId}` }
    );
  }

  public deleteBlock(blockId: string) {
    const entry = this.states.get(blockId);
    if (entry !== undefined) {
      this.states.delete(blockId);
      entry.change.markChanged();
    }
  }
}
