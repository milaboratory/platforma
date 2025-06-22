import { ref } from 'vue';
import { describe, it, vi, expect } from 'vitest';
import { useTimeoutPoll, isClient } from '@vueuse/core';
import { delay } from '@milaboratories/helpers';

async function fetchData() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const createTest = (immediate: boolean) => {
  it(`supports reactive intervals when immediate is ${immediate}`, async () => {
    // Librarry have unpredictable behaviour and `immediate` flag will work only in the main thread in browser!
    if (!isClient) {
      immediate = false;
    }

    const callback = vi.fn(fetchData);
    const interval = ref(10);
    const { pause, resume } = useTimeoutPoll(callback, interval, { immediate });

    if (!immediate) resume();
    expect(callback).toBeCalledTimes(1);
    await delay(interval.value + 5);
    expect(callback).toBeCalledTimes(2);
    await delay(interval.value);
    expect(callback).toBeCalledTimes(3);

    // Stop and check that no more calls are made
    callback.mockReset();
    pause();
    await delay(100);
    expect(callback).toBeCalledTimes(0);

    // Change the interval and resume
    interval.value = 50;
    resume();

    expect(callback).toBeCalledTimes(1);
    await delay(interval.value + 5);
    expect(callback).toBeCalledTimes(2);
    await delay(interval.value);
    expect(callback).toBeCalledTimes(3);
  });
};

describe('useTimeoutPoll', () => {
  createTest(true);
  createTest(false);
});
