<script setup lang="ts">
import type {
  PlChartStackedBarSettings,
  Color } from '@platforma-sdk/ui-vue';
import {
  PlRow,
  Gradient,
  PlChartStackedBar,
  PlCheckbox,
} from '@platforma-sdk/ui-vue';
import { computed, reactive } from 'vue';

const AlignmentChannelLabels = {
  Success: 'Successfully aligned',
  NoHits: 'No hits (not TCR/IG?)',
  NoCDR3Parts: 'No CDR3 parts',
  NoVHits: 'No V hits',
  NoJHits: 'No J hits',
  VAndJOnDifferentTargets: 'No target with both V and J',
  LowTotalScore: 'Low total score',
  NoBarcode: 'Absent barcode',
  SampleNotMatched: 'Sample not matched',
  FailedAfterAOverlap: 'Failed after alignment-overlap',
};

type Category = keyof typeof AlignmentChannelLabels;

// const oldColors = {
//   Success: '#6BD67D',
//   NoHits: '#FEE27A',
//   NoCDR3Parts: '#FEBF51',
//   NoVHits: '#FB9361',
//   NoJHits: '#E75B64',
//   VAndJOnDifferentTargets: '#B8397A',
//   LowTotalScore: '#7E2583',
//   NoBarcode: '#4B1979',
//   SampleNotMatched: '#2B125C',
//   FailedAfterAOverlap: 'red', // @TODO (was missing)
// };

const state = reactive({
  showTitle: false,
  showLegends: false,
});

const data: { category: Category; value: number }[] = [{
  value: 330,
  category: 'Success',
}, {
  category: 'NoHits',
  value: 60,
}, {
  category: 'NoCDR3Parts',
  value: 33,
}, {
  category: 'NoVHits',
  value: 60,
}, {
  category: 'NoJHits',
  value: 30,
}, {
  category: 'VAndJOnDifferentTargets',
  value: 30,
}, {
  category: 'LowTotalScore',
  value: 30,
}, {
  category: 'NoBarcode',
  value: 30,
}, {
  category: 'SampleNotMatched',
  value: 30,
}, {
  category: 'FailedAfterAOverlap',
  value: 40,
}];

const settings = computed<PlChartStackedBarSettings>(() => {
  const total = data.reduce((x, y) => x + y.value, 0);

  const categoryColors = {
    Success: Gradient('viridis').getNthOf(2, 5),
    NoHits: Gradient('magma').getNthOf(1, 9),
    NoCDR3Parts: Gradient('magma').getNthOf(2, 9),
    NoVHits: Gradient('magma').getNthOf(3, 9),
    NoJHits: Gradient('magma').getNthOf(4, 9),
    VAndJOnDifferentTargets: Gradient('magma').getNthOf(5, 9),
    LowTotalScore: Gradient('magma').getNthOf(6, 9),
    NoBarcode: Gradient('magma').getNthOf(7, 9),
    SampleNotMatched: Gradient('magma').getNthOf(8, 9),
    FailedAfterAOverlap: Gradient('magma').getNthOf(9, 9),
  } satisfies Record<Category, Color>;

  return {
    title: state.showTitle ? 'Stacked bar with legend 01 / Alignments' : undefined,
    showLegends: state.showLegends,
    data: data.map(({ category, value }) => {
      const color = categoryColors[category];
      return {
        label: AlignmentChannelLabels[category],
        value,
        color,
        description: [category, color.hex, 'fraction:' + (Math.round(value * 100 / total)) + '%', ' total:' + total].join('\n'),
      };
    }),
  };
});
</script>

<template>
  <PlRow>
    <PlCheckbox v-model="state.showTitle">Show title</PlCheckbox>
    <PlCheckbox v-model="state.showLegends">Show legends</PlCheckbox>
  </PlRow>
  <PlRow>
    <PlChartStackedBar :settings="settings" />
  </PlRow>
</template>

<style module>
.chip {
  width: 120px;
  height: 120px;
  color: #fff;
}
</style>
