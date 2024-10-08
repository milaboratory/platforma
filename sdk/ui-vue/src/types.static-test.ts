import type { Expect, Equal } from '@milaboratories/helpers';
import { z } from 'zod';
import type { ModelOptions, Model } from './types';
import type { BlockOutputsBase, InferHrefType, InferOutputsType, Platforma, ValueOrErrors } from '@platforma-sdk/model';
import type { BaseApp, createApp } from './internal/createApp';
import { type App } from './defineApp';
import { computed, type Component } from 'vue';

// declare const __platforma: Platforma<{}, { x: ValueOrErrors<number> }, {}, '/'>;

// const p = defineApp()

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
  onSave(_seed) {
    //
  },
});

const __model2 = __createModel({
  get() {
    return __args.seed;
  },
  validate,
  autoSave: true,
  onSave(_seed) {
    //
  },
});

type InferArgs<Pl extends Platforma> = Pl extends Platforma<infer Args> ? Args : never;
type InferUiState<Pl extends Platforma> = Pl extends Platforma<unknown, BlockOutputsBase, infer UiState> ? UiState : never;

export type TestApp<P extends Platforma> = ReturnType<typeof createApp<InferArgs<P>, InferOutputsType<P>, InferUiState<P>, InferHrefType<P>>>;

type _Args = {
  x: number;
  y: string[];
};

type _Outputs = {
  sum: ValueOrErrors<number>;
};

type _UiState = {
  flag: boolean;
};

type _App1 = BaseApp<_Args, _Outputs, _UiState, '/'>;
type _App2 = TestApp<Platforma<_Args, _Outputs, _UiState, '/'>>;

const local = () => {
  const counter = computed(() => 1);
  const label = computed(() => 'aaaa');

  const method = () => 100;

  return {
    counter,
    label,
    method,
    routes: {
      '/': undefined as unknown as Component,
    },
  };
};

type ExtApp = App<1, BlockOutputsBase, unknown, '/', ReturnType<typeof local>>;

declare const _app: ExtApp;

type _UpdateArgsParams = Parameters<Parameters<_App1['updateArgs']>[0]>[0];

type _ccc = _App1['model']['args'];

type __cases = [
  Expect<Equal<Model<string>, typeof __model1>>,
  Expect<Equal<Model<number>, typeof __model2>>,
  Expect<Equal<Model<string>, typeof __model1>>,
  Expect<Equal<Model<number>, typeof __model2>>,
  Expect<Equal<_App1, _App2>>,
  Expect<Equal<ExtApp['counter'], number>>,
  Expect<Equal<ExtApp['label'], string>>,
  Expect<Equal<ExtApp['method'], () => number>>,
  Expect<Equal<_App1['args'], Readonly<_Args>>>,
  Expect<Equal<_App1['model']['outputs']['sum'], number | undefined>>,
  Expect<Equal<_App1['model']['outputErrors']['sum'], Error | undefined>>,
  Expect<Equal<_App1['ui'], Readonly<_UiState>>>,
  Expect<Equal<_App1['model']['args'], _Args>>,
  Expect<Equal<_App1['model']['ui'], _UiState>>,
  Expect<Equal<_UpdateArgsParams, _Args>>,
];
