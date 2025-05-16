import { wrap } from 'comlink';
import type { MaybeRefOrGetter } from 'vue';
import { onWatcherCleanup, reactive, toValue, watchEffect } from 'vue';
import type { ChemicalPropertiesWorkerApi } from './chemical-properties.worker';
import ChemicalPropertiesWorker from './chemical-properties.worker?worker&inline';
import type { HighlightedColumn } from './types';

const worker = wrap<ChemicalPropertiesWorkerApi>(
  new ChemicalPropertiesWorker(),
);

export const chemicalCategories = [
  'hydrophobic',
  'positive_charge',
  'negative_charge',
  'polar',
  'cysteine',
  'glycine',
  'proline',
  'aromatic',
] as const;

export type ChemicalCategory = typeof chemicalCategories[number];

export const chemicalPropertiesLabels: Record<ChemicalCategory, string> = {
  hydrophobic: 'Hydrophobic',
  positive_charge: 'Positive Charge',
  negative_charge: 'Negative Charge',
  polar: 'Polar',
  cysteine: 'Cysteine',
  glycine: 'Glycine',
  proline: 'Proline',
  aromatic: 'Aromatic',
};

export const chemicalPropertiesColors: Record<ChemicalCategory, string> = {
  //   hydrophobic: categoricalColors.blue_light,
  //   positive_charge: categoricalColors.red_light,
  //   negative_charge: categoricalColors.violet_light,
  //   polar: categoricalColors.green_light,
  //   cysteine: categoricalColors.rose_light,
  //   glycine: categoricalColors.orange_light,
  //   proline: categoricalColors.lime_light,
  //   aromatic: categoricalColors.teal_light,
  hydrophobic: '#80a0f0',
  positive_charge: '#f01505',
  negative_charge: '#c048c0',
  polar: '#15c015',
  cysteine: '#f08080',
  glycine: '#f09048',
  proline: '#c0c000',
  aromatic: '#15a4a4',
};

export function useChemicalPropertiesHighlight(
  alignedRows: MaybeRefOrGetter<string[] | undefined>,
) {
  const highlight = reactive({
    value: [] as HighlightedColumn<ChemicalCategory>[],
    loading: false,
  });
  watchEffect(async () => {
    const rows = toValue(alignedRows);
    if (!rows) return;
    let aborted = false;
    onWatcherCleanup(() => {
      aborted = true;
    });
    try {
      highlight.loading = true;
      const value = await worker.getChemicalPropertiesHighlight(rows);
      if (aborted) return;
      highlight.value = value;
    } catch (error) {
      console.error(error);
      highlight.value = [];
    } finally {
      highlight.loading = false;
    }
  });
  return highlight;
}
