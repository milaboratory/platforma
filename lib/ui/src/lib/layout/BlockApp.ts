import { computed, reactive, type ComputedRef } from 'vue';
import { type PlCore, type Blocks, normalizeInputs, updateInputs } from '@milaboratory/platforma-core';
import { ucFirst } from '@milaboratory/helpers/strings';
import { deepClone } from '@milaboratory/helpers/objects';
import { notEmpty, errorOptional, type OkType } from '@milaboratory/helpers/utils';
import { predicateUnique } from '@milaboratory/helpers/collections';

export function useBlockInput<S extends PlCore.BlockState, I extends keyof S['inputs']>($block: ComputedRef<BlockApp<S>>, inputName: I) {
  return computed({
    get() {
      return $block.value.normalizedInputs[inputName];
    },
    set(v) {
      $block.value.setInput(inputName, v);
    },
  });
}

export abstract class BlockApp<S extends PlCore.BlockState = PlCore.BlockState, D extends Record<string, unknown> = Record<string, unknown>> {
  public readonly state: S;
  public data: D;
  public ready = false;

  public constructor(state: S) {
    this.state = reactive(state) as S;
    this.data = reactive(this.defaultData()) as D;
    this.initListeners();
    this.init();
  }

  static async load<S extends PlCore.BlockState, D extends Record<string, unknown>, Ctor extends typeof BlockApp<S, D>>(this: Ctor) {
    return api.getState().then((block) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore (ask me)
      return new this(block as S);
    });
  }

  initListeners() {
    api.onAction((ev) => {
      console.log('block:action, blockId:', this.blockId, ', action', JSON.stringify(ev)); // temp log
      this.onAction(ev);
      this.sendSettings();
    });

    api.onChanged(() => {
      api.getState().then((block) => {
        Object.assign(this.state, block);
        this.sendSettings();
      });
    });
  }

  init() {
    // do nothing
  }

  abstract onAction(ev: Blocks.BlockAction): void;

  beforeRun() {
    // do nothing
  }

  get blockId() {
    return this.state.id;
  }

  get block(): S {
    return this.state;
  }

  get normalizedInputs(): PlCore.NormalizedInputs<S['inputs']> {
    return normalizeInputs(deepClone(this.block.inputs));
  }

  getInput<K extends keyof PlCore.NormalizedInputs<S['inputs']>, V extends PlCore.NormalizedInputs<S['inputs']>[K]>(key: K): V {
    return this.normalizedInputs[key] as V;
  }

  setInput<K extends keyof PlCore.NormalizedInputs<S['inputs']>, V extends PlCore.NormalizedInputs<S['inputs']>[K]>(key: K, value: V) {
    const inputs = this.normalizedInputs;
    inputs[key] = value;
    this.saveInputs(inputs);
  }

  get outputMap(): S['outputMap'] {
    return this.block.outputMap;
  }

  abstract defaultData(): D;

  abstract getSections(): Blocks.TabSection[];

  sendSettings() {
    api.sendBlockTabPatch({
      type: 'block-tab-patch',
      blockId: this.block.id,
      sections: this.getSections() ?? [],
    });
  }

  selectLastPane() {
    const panes = this.getPanes();
    if (panes.length) {
      // panes[panes.length - 1].onClick(); // @TODO
    }
  }

  getPanes() {
    return this.getSections().flatMap((s) => s.panes);
  }

  runBtnText() {
    return 'Run';
  }

  getBlocks() {
    return [this.block, ...this.children] as PlCore.BlockState[];
  }

  findBlock(blockId: string) {
    return this.getBlocks().find((b) => b.id === blockId);
  }

  findBlockOrThrow(blockId: string) {
    return notEmpty(this.findBlock(blockId), `Not found block ${blockId}`);
  }

  getErrors() {
    return this.getBlocks().flatMap((b) => {
      return Object.values(b.outputMap)
        .flatMap((v) => {
          return errorOptional(v) ?? [];
        })
        .filter(predicateUnique);
    });
  }

  updateInputs(inputs: PlCore.NormalizedInputs<S['inputs']>) {
    Object.assign(this.block, updateInputs(this.block, inputs));
  }

  saveInputs(inputs: PlCore.NormalizedInputs<S['inputs']>) {
    this.updateInputs(inputs);
    this.saveChanges();
  }

  saveChanges() {
    return api.updateBlock(deepClone(this.block)).catch(console.error); // @TODO
  }

  get kind() {
    return this.block.kind;
  }

  get children(): PlCore.BlockState[] {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return this.block.children ?? [];
  }

  get title() {
    return this.block.name || ucFirst(this.block.kind);
  }

  get hasErrors() {
    return this.getErrors().length > 0;
  }

  get outdated() {
    return this.getBlocks().some((block) => !block.changed && block.depChanged);
  }

  get runAvailable() {
    if (this.hasErrors) {
      return true;
    }
    const blocks = this.getBlocks().filter((b) => b.meta?.blockType !== 'group');
    return blocks.every((block) => block.valid) && blocks.some((block) => block.changed || block.depChanged);
  }

  get indices() {
    return this.getBlocks().map((b) => b.id);
  }

  get processing() {
    return this.getBlocks().some((block) => block.processing);
  }

  getOutputResult<K extends keyof S['outputMap'], V extends S['outputMap'][K]>(key: K): V {
    return this.outputMap[key] as V;
  }

  getOutputOk<K extends keyof S['outputMap']>(key: K) {
    const result = this.getOutputResult(key);

    if (result?.ok) {
      return result.value as OkType<typeof result>;
    }
  }

  getRefOptions<K extends keyof S['outputMap'], _V extends S['outputMap'][K] & PlCore.Result<PlCore.DataSourceOption[]>>(key: K) {
    const output = this.getOutputOk(key) as PlCore.DataSourceOption[] | undefined;

    return (
      output?.map((it) => ({
        text: it.label,
        value: it.ref,
      })) ?? []
    );
  }

  /**
   * @deprecated
   */

  getBlockRef() {
    return computed(() => this.block);
  }

  toJSON() {
    return this.block;
  }
}
