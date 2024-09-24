import {expect, test} from '@jest/globals';
import {delay, timer, exclusiveRequest} from '@milaboratories/helpers';

test('Exclusive request', async () => {
  let num = 0;

  const myCall = async (arg: number) => {
    const d = timer();
    ++num;
    await delay(arg);
    return {
      arg,
      time: d()
    };
  };

  const exclusive = exclusiveRequest(myCall);

  const promises: Promise<unknown>[] = [];

  const results: number[] = [];

  for (const a of [100, 50, 80, 200, 101]) {
    await delay(0);
    promises.push(exclusive(a).then(r => {
      console.log('r', r);
      if (r.ok) {
        results.push(r.value.arg);
      }
    }));
  }

  await delay(120);

  promises.push(exclusive(160).then(r => {
    if (r.ok) {
      results.push(r.value.arg);
    }
  }))
  
  await Promise.allSettled(promises);

  console.log('results', results);

  expect(results).toEqual([100, 101, 160]);
});