<script setup lang="ts">
import { listToOptions } from '@milaboratories/helpers';
import { PlBlockPage, PlBtnGroup, PlCheckbox, PlRow } from '@platforma-sdk/ui-vue';
import { computed, reactive } from 'vue';

const data = reactive({
  longTitle: false,
  noBodyGutters: false,
  group: 'Lorem ipsum',
});

const loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const pageTitle = computed(() => data.longTitle ? loremIpsum : 'Layout page');

const options = listToOptions(['Lorem ipsum', 'two words', 'cccc dddd zzzz']);
</script>

<template>
  <PlBlockPage :no-body-gutters="data.noBodyGutters">
    <template #title> {{ pageTitle }} </template>
    <template #append>
      <PlRow>
        <PlBtnGroup v-model="data.group" :options="options"/>
        <PlCheckbox v-model="data.longTitle">Long title</PlCheckbox>
        <PlCheckbox v-model="data.noBodyGutters">No body gutters</PlCheckbox>
      </PlRow>
    </template>
    <div :class="$style.content">Content</div>
  </PlBlockPage>
</template>

<style module>
/* :global(.pl-container) {
  outline: 1px dotted #eee;
}

:global(.pl-section-separator) {
  outline: 1px dashed #eee;
} */

.content {
  display: flex;
  place-items: center;
  place-content: center;
  height: 100%;
  background-color: #eee;
  color: #fff;
  font-size: 34px;
  font-weight: bold;
}
</style>
