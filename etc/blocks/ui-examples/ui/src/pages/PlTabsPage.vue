<script setup lang="ts">
import {
  PlBlockPage,
  PlCheckbox,
  PlIcon24,
  PlRow,
  PlTabs,
  PlTextField,
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  currentTab: 'one',
  topLine: false,
  disabled: false,
  maxTabWidth: '200px',
});

const tabOptions = [
  { label: 'Tab Label', value: 'one' },
  { label: 'Tab Label', value: 'two' },
  { label: 'Tab Label', value: 'three' },
  { label: 'Tab Label', value: 'four' },
  { label: 'Disabled option', value: 'five', disabled: true },
  {
    label: 'Max width 200px for this specific option',
    value: 'five',
    maxWidth: '200px',
  },
];
</script>

<template>
  <PlBlockPage :class="$style.components" style="max-width: 100%">
    <template #title>Tabs</template>
    <PlRow>
      <PlTabs
        v-model="data.currentTab"
        :options="tabOptions"
        :top-line="data.topLine"
        :disabled="data.disabled"
        :max-tab-width="data.maxTabWidth"
      />
    </PlRow>
    <PlRow>
      <PlTabs
        v-model="data.currentTab"
        :options="tabOptions"
        :top-line="data.topLine"
        :disabled="data.disabled"
        :max-tab-width="data.maxTabWidth"
      >
        <template #one="{ option }">
          <span>Use slot to customize tab content: {{ option.label }}</span>
          <PlIcon24 name="settings" />
        </template>
      </PlTabs>
    </PlRow>
    <PlRow>
      <PlCheckbox v-model="data.topLine">Top Line</PlCheckbox>
      <PlCheckbox v-model="data.disabled">Disabled (all)</PlCheckbox>
      <PlTextField v-model="data.maxTabWidth" label="Max tab width (px or %)" />
    </PlRow>
    <PlRow> currentTab: {{ data.currentTab }} </PlRow>
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
