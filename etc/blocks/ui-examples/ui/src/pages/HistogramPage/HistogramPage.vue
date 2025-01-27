<script setup lang="ts">
import {
  PlBlockPage,
  PlRow,
  PlBtnGroup,
  PlContainer,
} from '@platforma-sdk/ui-vue';
import type { Component } from 'vue';
import { shallowRef } from 'vue';
import Basic from './Basic.vue';
import HistogramFigma from './HistogramFigma.vue';
import LogXScale from './LogXScale.vue';
import LogBins from './LogBins.vue';

const current = shallowRef<Component>(Basic);

const options = [{
  label: 'Basic',
  value: Basic,
}, {
  label: 'LogXScale',
  value: LogXScale,
}, {
  label: 'Precalculated bins',
  value: LogBins,
}];
</script>

<template>
  <PlBlockPage :class="$style.components" style="max-width: 100%">
    <template #title>
      PlChartStackedBar
    </template>
    <PlRow>
      <PlBtnGroup v-model="current" :options="options" />
    </PlRow>
    <PlRow>
      <PlContainer width="920px" style="padding: 24px 56px 24px 24px; outline: 1px solid #ccc;" >
        <component :is="current" />
      </PlContainer>
    </PlRow>
    <PlRow>
      <HistogramFigma />
    </PlRow>
  </PlBlockPage>
</template>

<style module>
.components pre {
  border: 1px solid var(--txt-01);
  padding: 12px;
  font-weight: bolder;
  overflow: auto;
  max-width: 50vw;
  background-color: #eeeeee55;
}
</style>
