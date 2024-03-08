import { clamp } from '@/lib/helpers/math';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
export const useSliderBreakpoints = (props: ComputedRef<{ min: number; max: number; step: number }>) => {
  return computed(() => {
    const result: number[] = [];
    let start = 0;
    const { min, max, step } = props.value;
    while (start < max) {
      start += step;
      const posValue = (clamp(start, min, max) - min) / (max - min);
      const percent = (1 - posValue) * 100;
      result.push(percent);
    }
    result.push(100);
    return result;
  });
};
