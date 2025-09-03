<script setup lang="ts">
import { PlBlockPage, PlBtnGroup, PlRow } from '@platforma-sdk/ui-vue';
import { shallowRef } from 'vue';
import type { Component } from 'vue';
import BasicTab from './BasicTab.vue';
import ComboboxTab from './ComboboxTab.vue';

const current = shallowRef<Component>(BasicTab);

const options = [{
  label: 'Basic',
  value: BasicTab,
}, {
  label: 'Combobox',
  value: ComboboxTab,
}];
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>
      PlAutocompleteMulti
    </template>
    <PlRow>
      <PlBtnGroup v-model="current" :options="options" />
    </PlRow>
    <PlRow>
      <component :is="current" />
    </PlRow>
  </PlBlockPage>
</template>
