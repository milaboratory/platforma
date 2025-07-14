import { deepClone, delay, uniqueId } from '@milaboratories/helpers';
import type {
  BlockOutputsBase,
  BlockState,
  NavigationState,
  ValueWithUTag,
  AuthorMarker,
  ValueWithUTagAndAuthor,
} from '@platforma-sdk/model';
import { compare, type Operation } from 'fast-json-patch';

export abstract class BlockMock<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> {
  #uTag: string = uniqueId();
  #previousState: BlockState<Args, Outputs, UiState, Href>;

  constructor(
    public args: Args,
    public outputs: Outputs,
    public ui: UiState,
    public href: Href,
    public author?: AuthorMarker | undefined,
  ) {
    this.#previousState = this.getState();
  }

  get uTag(): string {
    return this.#uTag;
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
    console.log('setBlockArgsAndUiState', args, ui);
    if (Math.random() > 0.5) {
      throw new Error('Test error');
    }
    this.args = args;
    this.ui = ui;
    await this.doUpdate();
  }

  async setNavigationState(navigationState: NavigationState<Href>) {
    this.href = navigationState.href;
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
      author: this.author,
    });
  }

  async getJsonPatches(uTag: string): Promise<ValueWithUTagAndAuthor<Operation[]>> {
    while (uTag === this.#uTag) {
      await delay(10);
    }

    const currentState = this.getState();
    const patches = compare(this.#previousState, currentState);
    this.#previousState = currentState;
    console.log('new patches', patches);
    return {
      uTag: this.#uTag,
      value: patches,
      author: this.author,
    };
  }

  private async doUpdate() {
    await this.process();
    this.#uTag = uniqueId();
  }

  abstract process(): Promise<void>;
}

export type InferState<B> = B extends BlockMock<infer S> ? S : never;
