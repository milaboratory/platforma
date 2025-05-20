import type { Remote } from 'comlink';
import { wrap } from 'comlink';
import type { MaybeRefOrGetter } from 'vue';
import { onWatcherCleanup, ref, toRaw, toValue, watchEffect } from 'vue';
import type { ChemicalPropertiesWorkerApi } from './chemical-properties.worker';
import ChemicalPropertiesWorker from './chemical-properties.worker?worker&inline';
import type { HighlightedColumn } from './types';

let worker: Remote<ChemicalPropertiesWorkerApi> | undefined;

function getWorker(): Remote<ChemicalPropertiesWorkerApi> {
  if (!worker) {
    worker = wrap<ChemicalPropertiesWorkerApi>(new ChemicalPropertiesWorker());
  }
  return worker;
}

export const chemicalCategories = [
  'hydrophobic',
  'positiveCharge',
  'negativeCharge',
  'polar',
  'cysteine',
  'glycine',
  'proline',
  'aromatic',
] as const;

export type ChemicalCategory = typeof chemicalCategories[number];

export const chemicalPropertiesLabels: Record<ChemicalCategory, string> = {
  hydrophobic: 'Hydrophobic',
  positiveCharge: 'Positive Charge',
  negativeCharge: 'Negative Charge',
  polar: 'Polar',
  cysteine: 'Cysteine',
  glycine: 'Glycine',
  proline: 'Proline',
  aromatic: 'Aromatic',
};

export const chemicalPropertiesColors: Record<ChemicalCategory, string> = {
  hydrophobic: '#99CCFF',
  positiveCharge: '#FFA2A3',
  negativeCharge: '#C1ADFF',
  polar: '#99E099',
  cysteine: '#FAAAFA',
  glycine: '#F7BC5D',
  proline: '#FFFF8F',
  aromatic: '#A2F5FA',
};

export function useChemicalPropertiesHighlight(
  alignedRows: MaybeRefOrGetter<string[] | undefined>,
) {
  const data = ref<HighlightedColumn<ChemicalCategory>[]>([]);
  const loading = ref(false);
  watchEffect(async () => {
    const rows = toValue(alignedRows);
    if (!rows) return;
    let aborted = false;
    onWatcherCleanup(() => {
      aborted = true;
    });
    try {
      loading.value = true;
      const value = await getWorker().getChemicalPropertiesHighlight(
        toRaw(rows),
      );
      if (aborted) return;
      data.value = value;
    } catch (error) {
      console.error(error);
      data.value = [];
    } finally {
      loading.value = false;
    }
  });
  return { data, loading };
}
