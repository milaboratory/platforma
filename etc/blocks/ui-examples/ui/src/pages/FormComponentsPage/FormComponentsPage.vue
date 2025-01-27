<script setup lang="ts">
import {
  PlBlockPage,
  PlRow,
  PlBtnGroup,
  PlContainer,
} from '@platforma-sdk/ui-vue';
import type { Component } from 'vue';
import { shallowRef } from 'vue';
import WithTooltips from './WithTooltips.vue';
import Main from './Main.vue';
import Dropdowns from './Dropdowns.vue';

const current = shallowRef<Component>(Main);

const options = [{
  label: 'Main',
  value: Main,
}, {
  label: 'Tooltips',
  value: WithTooltips,
}, {
  label: 'Dropdown Examples',
  value: Dropdowns,
}];
</script>

<template>
  <PlBlockPage :class="$style.components">
    <template #title>Form components</template>
    <PlRow>
      <PlContainer>
        <PlBtnGroup v-model="current" :options="options" />
      </PlContainer>
    </PlRow>
    <PlRow>
      <component :is="current" />
    </PlRow>
  </PlBlockPage>
</template>

<style module>
/* :global(.pl-container) {
  outline: 1px dotted #eee;
}

:global(.pl-section-separator) {
  outline: 1px dashed #eee;
} */

.components pre {
  border: 1px solid var(--txt-01);
  padding: 12px;
  font-weight: bolder;
  overflow: auto;
  max-width: 50vw;
  background-color: #eeeeee55;
}
</style>
