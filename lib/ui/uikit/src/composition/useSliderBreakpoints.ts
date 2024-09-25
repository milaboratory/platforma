import { clamp } from '@/helpers/math';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
export const useSliderBreakpoints = (props: ComputedRef<{ min: number; max: number; step: number }>) => {
  return computed(() => {
    const result: number[] = [100];
    const { min, max, step } = props.value;
    let start = min;
    while (start < max) {
      start += step;
      const posValue = (clamp(start, min, max) - min) / (max - min);
      const percent = (1 - posValue) * 100;
      result.push(percent);
    }
    return result;
  });
};
