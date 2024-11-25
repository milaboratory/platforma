import {expect, test} from '@jest/globals';
import {deepPatch} from '@milaboratories/helpers';

test('Deep patch', async () => {
  type Test = {
    num: number;
    arr: number[];
    s?: string | undefined;
    next?: Test;
  };

  const size = (obj: object) => Object.keys(obj).length; 

  const target = {num: 100, arr: []} as Test;

  expect(size(target)).toBe(2);

  deepPatch<Test>(target, {num: 1, arr: [], s: 'I'});

  expect(target).toStrictEqual({num: 1, arr: [], s: 'I'});

  expect(size(target)).toBe(3);

  deepPatch<Test>(target, {num: 1, arr: []});

  expect(target).toStrictEqual({num: 1, arr: [], s: undefined}); // important

  expect(size(target)).toBe(3);

  deepPatch<Test>(target, {num: 1, arr: [1, 2, 3]});

  expect(target).toStrictEqual({num: 1, arr: [1, 2, 3], s: undefined}); // important

  expect(size(target)).toBe(3);

  delete target.s;

  deepPatch<Test>(target, {num: 1, arr: [1, 2, 3]});

  expect(size(target)).toBe(2);

  deepPatch(target, {num: 1, arr: [], next: {num: 1, arr: []}});

  expect(target).toStrictEqual({num: 1, arr: [], next: {num: 1, arr: []}});
  
  const next = target.next;

  deepPatch(target, {num: 1, arr: [], next: {num: 1, arr: [1]}});

  expect(target).toStrictEqual({num: 1, arr: [], next: {num: 1, arr: [1]}});

  expect(target.next === next).toEqual(true);

  const nextArr = target.next?.arr;

  deepPatch(target, {num: 1, arr: [], next: {num: 1, arr: [2]}});

  expect(target.next?.arr === nextArr).toEqual(true);

  deepPatch(target, {num: 1, arr: [], next: {num: 1, arr: [2, 3]}});

  expect(target.next?.arr === nextArr).toEqual(false);
}, 1000);
