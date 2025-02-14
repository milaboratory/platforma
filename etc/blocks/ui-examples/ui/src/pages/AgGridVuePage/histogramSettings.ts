import { computed } from 'vue';
import bins from '../HistogramPage/assets/bins';

export const histogramSettings = computed(() => {
  return {
    type: 'log-bins' as const,
    title: 'Predefined bins (log x scale)',
    bins,
    threshold: 19.0,
    yAxisLabel: 'Number of UMIs',
    xAxisLabel: 'Number of reads per UMI',
  };
});
