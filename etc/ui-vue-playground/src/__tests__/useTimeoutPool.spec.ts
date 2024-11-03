import { ref } from 'vue'
import { describe, it, vi, expect } from 'vitest'
import { useTimeoutPoll } from '@vueuse/core'
import { delay } from '@milaboratories/helpers';

const count = ref(0)
async function fetchData() {
  await new Promise(resolve => setTimeout(resolve, 0));
  count.value++
}

const createTest = (immediate: boolean) => {
  it(`supports reactive intervals when immediate is ${immediate}`, async () => {
    const callback = vi.fn(fetchData);
    const interval = ref(0)
    const { pause, resume } = useTimeoutPoll(callback, interval, { immediate })

    if (!immediate)
      resume()
    await delay(1)
    expect(callback).toBeCalled();
    await delay(2)
    expect(callback).toBeCalledTimes(2);
    pause()

    interval.value = 50

    resume()
    callback.mockReset()

    // @TODO (flapping, may be a bug)
    // await delay(10)
    // expect(callback).not.toBeCalled()
    await delay(102)
    expect(callback).toBeCalled()

    callback.mockReset()
    pause()
    await delay(102)
    expect(callback).not.toBeCalled()

    resume()
    await delay(1)
    expect(callback).toBeCalled()

    callback.mockReset()
    await delay(102)
    expect(callback).toBeCalled()
  })
};

describe('useTimeoutPoll', () => {
  createTest(true);
  createTest(false);
})

