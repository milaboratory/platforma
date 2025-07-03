import type { ComputableCtx } from '@milaboratories/computable';
import { ChangeSource, Computable } from '@milaboratories/computable';
import type { NavigationState } from '@platforma-sdk/model';
import { DefaultNavigationState } from '@platforma-sdk/model';

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
    entry.change.markChanged('navigation state changed');
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
      { key: `navigationState#${blockId}` },
    );
  }

  public deleteBlock(blockId: string) {
    const entry = this.states.get(blockId);
    if (entry !== undefined) {
      this.states.delete(blockId);
      entry.change.markChanged('block deleted');
    }
  }
}
