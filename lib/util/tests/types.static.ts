import { Equal, Expect, Objectify, Unionize } from "@milaboratory/helpers/types";

type _Test = {
  args: {
    readonly x: number;
    y: number;
  };
  ui: number[];
  outputs: readonly number[];
};

type _cases = [
  Expect<Equal<_Test, Objectify<Unionize<_Test>>>>
];