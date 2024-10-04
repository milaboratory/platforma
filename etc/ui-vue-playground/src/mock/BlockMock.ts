import { deepClone, unionize } from '@milaboratories/helpers';
import type {
  BlockOutputsBase,
  BlockState,
  BlockStatePatch,
} from '@platforma-sdk/model';

export abstract class BlockMock<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`
> {
  #afterUpdate: ((updates: BlockStatePatch<Args, Outputs, UiState, Href>[]) => Promise<void>) | undefined;

  constructor(public args: Args, public outputs: Outputs, public ui: UiState, public href: Href) {

  }

  async setBlockArgs(args: Args) {
    this.args = args;
    await this.doUpdate();
  }

  async setBlockUiState(ui: UiState) {
    this.ui = ui;
    await this.doUpdate();
  }

  async setBlockArgsAndUiState(args: Args, ui: UiState) {
    this.args = args;
    this.ui = ui;
    await this.doUpdate();
  }

  getState(): BlockState<Args, Outputs, UiState, Href> {
    return deepClone({
      args: this.args,
      ui: this.ui,
      outputs: this.outputs,
      navigationState: {
        href: this.href
      }
    });
  }

  getPatches(): BlockStatePatch<Args, Outputs, UiState, Href>[] {
    return unionize(deepClone({
      outputs: this.outputs,
    }));
  }

  private async doUpdate() {
    await this.process();
    if (this.#afterUpdate) {
      await this.#afterUpdate(this.getPatches());
    }
  }

  abstract process(): Promise<void>;

  onNewState(cb: (updates: BlockStatePatch<Args, Outputs, UiState, Href>[]) => Promise<void>) {
    this.#afterUpdate = cb;
  }
}

export type InferState<B> = B extends BlockMock<infer S> ? S : never;