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

export class BlockStateMock<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> {
  constructor(
    public args: Args,
    public outputs: Outputs,
    public ui: UiState,
    public href: Href,
    public author: AuthorMarker = { authorId: 'test', localVersion: 0 },
    public uTag: string = uniqueId(),
  ) {}

  setState(_state: Partial<BlockStateMock<Args, Outputs, UiState, Href>>) {
    const state = deepClone(_state);
    this.args = state.args ?? this.args;
    this.outputs = state.outputs ?? this.outputs;
    this.ui = state.ui ?? this.ui;
    this.href = state.href ?? this.href;
    this.author = state.author ?? this.author;
    console.log('set author', state.author);
    this.uTag = uniqueId();
  }
}

export abstract class BlockMock<
  Args = unknown,
  Outputs extends BlockOutputsBase = BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
> implements BlockApiV2<Args, Outputs, UiState, Href> {
  #previousState: {
    uTag: string;
    value: BlockState<Args, Outputs, UiState, Href>;
  } | undefined;

  constructor(
    public state: BlockStateMock<Args, Outputs, UiState, Href>,
  ) {
    this.loadBlockState().then(unwrapResult).then(({ uTag, value }) => {
      this.#previousState = { value, uTag };
    });
  }

  async dispose(): Promise<ResultOrError<void>> {
    console.log('unused');
    return { value: undefined };
  }

  get uTag(): string {
    return this.state.uTag;
  }

  async setBlockArgs(args: Args, author?: AuthorMarker) {
    return wrapAsyncCallback(() => {
      this.state.setState({ args, author });
      return this.doUpdate();
    });
  }

  async setBlockUiState(ui: UiState, author?: AuthorMarker) {
    return wrapAsyncCallback(async () => {
      this.state.setState({ ui, author });
      return this.doUpdate();
    });
  }

  async setBlockArgsAndUiState(args: Args, ui: UiState, author?: AuthorMarker) {
    return wrapAsyncCallback(async () => {
      await delay(0);
      if (typeof ui === 'object' && ui !== null && 'delay' in ui && ui.delay && typeof ui.delay === 'number') {
        console.log('DELAY', ui.delay);
        await delay(ui.delay);
      }
      this.state.setState({ args, ui, author });
      return this.doUpdate();
    });
  }

  async setNavigationState(navigationState: NavigationState<Href>) {
    return wrapAsyncCallback(() => {
      this.state.setState({ href: navigationState.href });
      return this.doUpdate();
    });
  }

  async loadBlockState(): Promise<ResultOrError<ValueWithUTag<BlockState<Args, Outputs, UiState, Href>>>> {
    return wrapAsyncCallback(async () => {
      return deepClone({
        value: {
          args: this.state.args,
          ui: this.state.ui,
          outputs: this.state.outputs,
          navigationState: {
            href: this.state.href,
          },
          author: this.state.author,
        },
        uTag: this.state.uTag,
      });
    });
  }

  async getPatches(uTag: string): Promise<ResultOrError<ValueWithUTagAndAuthor<Operation[]>>> {
    return wrapAsyncCallback(async () => {
      while (uTag === this.state.uTag) {
        await delay(0);
      }

      if (this.#previousState?.uTag !== uTag) {
        console.log('uTag mismatch, resetting previous state');
        this.#previousState = undefined;
      }

      const currentState = await this.loadBlockState().then(unwrapResult).then(({ uTag, value }) => ({ uTag, value }));
      const patches = compare(this.#previousState?.value ?? {}, currentState.value);
      this.#previousState = currentState;
      return {
        uTag: this.state.uTag,
        value: patches,
        author: this.state.author,
      };
    });
  }

  private async doUpdate() {
    await this.process();
  }

  abstract process(): Promise<void>;
}

export type InferState<B> = B extends BlockMock<infer S> ? S : never;
