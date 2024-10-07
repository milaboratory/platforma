import { describe, it, expect } from 'vitest';
import { useWatchFetch } from '@platforma-sdk/ui-vue';
import { isReactive, reactive } from 'vue';
import { Deferred, delay } from '@milaboratories/helpers';

describe('useWatchFetch', () => {
  it('basic', async () => {
    const data = reactive({
      number: 0
    });

    const nums = [1, 2, 4, 12, 1, 2, 6, 3];

    const last = nums[nums.length - 1];

    const deferred = new Deferred<void>();

    const result = useWatchFetch(
      () => data.number,
      async (n) => {
        await delay(n === 2 ? 20 : n);
        if (n === last) {
          console.log('>>>> last', n);
          deferred.resolve();
        }
        return n;
      }
    );

    expect(isReactive(result)).toEqual(true);

    for (const n of nums) {
      data.number = n;
      await delay(0);
    }

    await deferred.promise;

    await delay(1);

    expect(result.value).toBe(last);
  });
});
