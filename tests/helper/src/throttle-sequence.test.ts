import {test, expect} from '@jest/globals';
import {utils} from '@milaboratories/helpers';
import {sequence} from '@milaboratories/sequences';

const {delay, arrayFrom} = utils;

test('Throttle', async () => {
  const values = arrayFrom(20, i => i);

  async function* gen() {
    let a = [...values];
    while (a.length) {
      yield a.shift()!;
      await delay(10);
    }
  }

  for (const options of [
    {leading: false, trailing: false},
    {leading: true, trailing: false},
    {leading: false, trailing: true},
    {leading: true, trailing: true}
  ]) {
    const results = await sequence(gen()).map(v => v).throttle(20, options).toArray();
    console.log('options', JSON.stringify(options))
    console.log(` values (${values.length}):`, values.join(', '));
    console.log(`results (${results.length}):`, results.join(', '));
    console.log();
  }
}, 10000);
