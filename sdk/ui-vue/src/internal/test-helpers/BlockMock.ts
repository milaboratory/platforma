import { deepClone, delay, uniqueId } from '@milaboratories/helpers';
import {
  type BlockOutputsBase,
  type BlockState,
  type NavigationState,
  type AuthorMarker,
  type ValueWithUTagAndAuthor,
  wrapAsyncCallback,
  type ResultOrError,
  unwrapResult,
} from '@platforma-sdk/model';
import { compare, type Operation } from 'fast-json-patch';
import type { BlockApiV2, ValueWithUTag } from '@platforma-sdk/model';

export abstract class BlockMock<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> implements BlockApiV2<Args, Outputs, UiState, Href> {
  #uTag: string = uniqueId();
  #previousState: BlockState<Args, Outputs, UiState, Href> | undefined;

  constructor(
    public args: Args,
    public outputs: Outputs,
    public ui: UiState,
    public href: Href,
    public author?: AuthorMarker | undefined,
  ) {
    this.loadBlockState().then(unwrapResult).then(({ value }) => {
      this.#previousState = value;
    });
  }

  get uTag(): string {
    return this.#uTag;
  }

  async setBlockArgs(args: Args, author?: AuthorMarker) {
    console.log('setBlockArgs', args, author);
    return wrapAsyncCallback(() => {
      this.author = author;
      this.args = args;
      return this.doUpdate();
    });
  }

  async setBlockUiState(ui: UiState, author?: AuthorMarker) {
    return wrapAsyncCallback(() => {
      this.ui = ui;
      this.author = author;
      return this.doUpdate();
    });
  }

  async setBlockArgsAndUiState(args: Args, ui: UiState, author?: AuthorMarker) {
    console.log('setBlockArgsAndUiState', args, ui, author);
    return wrapAsyncCallback(() => {
      this.args = args;
      this.ui = ui;
      this.author = author;
      return this.doUpdate();
    });
  }

  async setNavigationState(navigationState: NavigationState<Href>) {
    return wrapAsyncCallback(() => {
      this.href = navigationState.href;
      return this.doUpdate();
    });
  }

  async loadBlockState(): Promise<ResultOrError<ValueWithUTag<BlockState<Args, Outputs, UiState, Href>>>> {
    return wrapAsyncCallback(async () => {
      return deepClone({
        value: {
          args: this.args,
          ui: this.ui,
          outputs: this.outputs,
          navigationState: {
            href: this.href,
          },
          author: this.author,
        },
        uTag: this.#uTag,
      });
    });
  }

  async getPatches(uTag: string): Promise<ResultOrError<ValueWithUTagAndAuthor<Operation[]>>> {
    return wrapAsyncCallback(async () => {
      while (uTag === this.#uTag) {
        await delay(10);
      }

      const currentState = await this.loadBlockState().then(unwrapResult).then(({ value }) => value);
      const patches = compare(this.#previousState ?? {}, currentState);
      this.#previousState = currentState;
      console.log('new patches', patches);
      return {
        uTag: this.#uTag,
        value: patches,
        author: this.author,
      };
    });
  }

  private async doUpdate() {
    await this.process();
    this.#uTag = uniqueId();
  }

  abstract process(): Promise<void>;
}

export type InferState<B> = B extends BlockMock<infer S> ? S : never;
