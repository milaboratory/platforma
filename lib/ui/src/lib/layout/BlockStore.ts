import { computed } from 'vue';
import { errorOptional } from '@milaboratory/helpers/utils';
import type { OkType } from '@milaboratory/helpers/types';
import { predicateUnique } from '@milaboratory/helpers/collections';
import { type PlCore, normalizeInputs, updateInputs } from '@milaboratory/platforma-core';
import { utils, strings, objects } from '@milaboratory/helpers';

const deepClone = objects.deepClone;

// @TODO move & refactor
export class BlockStore<State extends PlCore.BlockState = PlCore.BlockState> {
  public constructor(public readonly block: State) {
    this.init();
  }

  init() {
    // do nothing
  }

  beforeRun() {
    // do nothing
  }

  get normalizedInputs(): PlCore.NormalizedInputs<State['inputs']> {
    return normalizeInputs(deepClone(this.block.inputs));
  }

  get outputMap(): State['outputMap'] {
    return this.block.outputMap;
  }

  getBlocks() {
    return [this.block, ...this.children] as PlCore.BlockState[];
  }

  findBlock(blockId: string) {
    return this.getBlocks().find((b) => b.id === blockId);
  }

  findBlockOrThrow(blockId: string) {
    return utils.notEmpty(this.findBlock(blockId), `Not found block ${blockId}`);
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

  setInput<K extends keyof PlCore.NormalizedInputs<State['inputs']>, V extends PlCore.NormalizedInputs<State['inputs']>[K]>(key: K, value: V) {
    const inputs = this.normalizedInputs;
    inputs[key] = value;
    this.saveInputs(inputs);
  }

  updateInputs(inputs: PlCore.NormalizedInputs<State['inputs']>) {
    Object.assign(this.block, updateInputs(this.block, inputs));
  }

  saveInputs(inputs: PlCore.NormalizedInputs<State['inputs']>) {
    this.updateInputs(inputs);
    this.saveChanges();
  }

  saveChanges() {
    return api
      .updateBlock({
        inputs: deepClone(this.block.inputs),
        id: this.block.id,
        refId: this.block.refId,
        name: this.block.name,
      })
      .catch(console.error); // @TODO
  }

  async runBlock(): Promise<void> {
    this.beforeRun();

    throw Error('unimplemented');
  }

  get kind() {
    return this.block.kind;
  }

  get children() {
    // @TODO
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return this.block.children ?? [];
  }

  get title() {
    return this.block.name || strings.ucFirst(this.block.kind);
  }

  get hasErrors() {
    return this.getErrors().length > 0;
  }

  get outdated() {
    return this.getBlocks().some((block) => !block.changed && block.depChanged);
  }

  get runAvailable() {
    const blocks = this.getBlocks().filter((b) => b.meta?.blockType !== 'group');
    return blocks.every((block) => block.valid) && blocks.some((block) => block.changed || block.depChanged);
  }

  get indices() {
    return this.getBlocks().map((b) => b.id);
  }

  get processing() {
    return this.getBlocks().some((block) => block.processing);
  }

  getOutputResult<K extends keyof State['outputMap'], V extends State['outputMap'][K]>(key: K): V {
    return this.outputMap[key] as V;
  }

  getOutputOk<K extends keyof State['outputMap']>(key: K) {
    const result = this.getOutputResult(key);

    if (result?.ok) {
      return result.value as OkType<typeof result>;
    }
  }

  getRefOptions<K extends keyof State['outputMap'], _V extends State['outputMap'][K] & PlCore.Result<PlCore.DataSourceOption[]>>(key: K) {
    const output = this.getOutputOk(key) as PlCore.DataSourceOption[] | undefined;

    return (
      output?.map((it) => ({
        text: it.label,
        value: it.ref,
      })) ?? []
    );
  }

  /* Usables */

  useInput<I extends keyof State['inputs']>(inputName: I) {
    computed({
      get: () => {
        return this.normalizedInputs[inputName];
      },
      set: (v) => {
        this.setInput(inputName, v);
      },
    });
  }

  /**
   * @deprecated
   */

  getBlockRef() {
    return computed(() => this.block);
  }
}
