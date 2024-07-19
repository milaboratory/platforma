import type { Expect, Equal } from '@milaboratory/helpers/types';
import { z } from 'zod';
import type { ModelOptions, Model } from './types';
import type { BlockOutputsBase, InferHrefType, InferOutputsType, Platforma } from '@milaboratory/sdk-ui';
import type { App, createApp } from './createApp';

declare function __createModel<M, V = unknown>(options: ModelOptions<M, V>): Model<M>;

declare const __args: {
  seed: number;
};

const validate = z.coerce.number().int().parse;

type _number = ReturnType<typeof validate>;

const __model1 = __createModel({
  get() {
    return String(__args.seed);
  },
  validate,
  autoSave: true,
  onSave(seed) {
    console.log('save', seed);
  },
});

const __model2 = __createModel({
  get() {
    return __args.seed;
  },
  validate,
  autoSave: true,
  onSave(seed) {
    console.log('save', seed);
  },
});

type InferArgs<Pl extends Platforma> = Pl extends Platforma<infer Args> ? Args : never;
type InferUiState<Pl extends Platforma> = Pl extends Platforma<unknown, BlockOutputsBase, infer UiState> ? UiState : never;

export type TestApp<P extends Platforma> = ReturnType<typeof createApp<InferArgs<P>, InferOutputsType<P>, InferUiState<P>, InferHrefType<P>>>;

type _App1 = App<1, BlockOutputsBase, unknown, '/'>;
type _App2 = TestApp<Platforma<1, BlockOutputsBase, unknown, '/'>>;

type __cases = [
  Expect<Equal<Model<string>, typeof __model1>>,
  Expect<Equal<Model<number>, typeof __model2>>,
  Expect<Equal<Model<string>, typeof __model1>>,
  Expect<Equal<Model<number>, typeof __model2>>,
  Expect<Equal<_App1, _App2>>,
];
