import type { Expect, Equal } from '@milaboratory/helpers/types';
import { z } from 'zod';
import type { ModelOptions, Model } from './types';

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

type __cases = [Expect<Equal<Model<string>, typeof __model1>>, Expect<Equal<Model<number>, typeof __model2>>];