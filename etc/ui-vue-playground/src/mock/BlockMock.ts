import { deepClone } from '@milaboratories/helpers';
import type {
  BlockOutputsBase,
  BlockState,
  BlockStatePatch,
} from '@platforma-sdk/model';
import { compare, type Operation } from 'fast-json-patch';

export abstract class BlockMock<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> {
  #afterUpdate: ((updates: BlockStatePatch<Args, Outputs, UiState, Href>[]) => Promise<void>) | undefined;
  #previousState: BlockState<Args, Outputs, UiState, Href>;
  #hasPendingChanges = false;

  constructor(public args: Args, public outputs: Outputs, public ui: UiState, public href: Href) {
    this.#previousState = this.getState();
  }

  onNewState(callback: (patches: BlockStatePatch<Args, Outputs, UiState, Href>[]) => Promise<void>) {
    this.#afterUpdate = callback;
  }

  async setBlockArgs(args: Args) {
    console.log('setBlockArgs', args);
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
        href: this.href,
      },
    });
  }

  getJsonPatches(): Operation[] {
    if (!this.#hasPendingChanges) {
      return [];
    }

    const currentState = this.getState();
    const patches = compare(this.#previousState, currentState);
    this.#previousState = currentState;
    this.#hasPendingChanges = false;
    console.log('getJsonPatches', patches);
    return patches;
  }

  getBlockStatePatches(): BlockStatePatch<Args, Outputs, UiState, Href>[] {
    return [
      {
        key: 'outputs',
        value: deepClone(this.outputs),
      },
    ];
  }

  private async doUpdate() {
    await this.process();
    this.#hasPendingChanges = true;
    if (this.#afterUpdate) {
      await this.#afterUpdate(this.getBlockStatePatches());
    }
  }

  abstract process(): Promise<void>;
}

export type InferState<B> = B extends BlockMock<infer S> ? S : never;
