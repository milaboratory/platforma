<script lang="ts" setup>
import { reactive, watch } from 'vue';
import { appSettings, useApp } from './app';
import { PlCheckbox, PlNumberField, PlTextField } from '@platforma-sdk/ui-vue';

const app = useApp();

const data = reactive({
  uiChanged: 0,
});

watch(() => app.model.ui, (newUi) => {
  data.uiChanged++;
  app.model.args.y = newUi.label.length;
}, {immediate: true, deep: true});
</script>

<template>
  <div :class="$style.container">
    <div>Args</div>

    <PlCheckbox v-model="appSettings.debug"> Debug </PlCheckbox>

    <PlNumberField label="X" v-model="app.model.args.x" />
    <PlNumberField label="Y" v-model="app.model.args.y" />

    <div>app.model.outputs.sum: {{ app.model.outputs.sum }}</div>

    <div>Ui: {{ app.model.ui }}, was changed {{ data.uiChanged }} times</div>

    <PlTextField v-model="app.model.ui.label" />

    <div>Sum error?: {{ app.model.outputErrors.sum }}</div>
  </div>
</template>

<style lang="scss" module>
.container {
  width: 600px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
}
</style>

