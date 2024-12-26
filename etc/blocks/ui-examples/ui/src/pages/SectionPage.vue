<script setup lang="ts">
import {
  PlBlockPage,
  PlBtnPrimary,
  PlEditableTitle,
  PlRow,
} from '@platforma-sdk/ui-vue';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const section = computed(() => app.model.ui.dynamicSections.find((it) => it.id === app.queryParams.id));

const label = computed({
  get() {
    return section.value?.label ?? '';
  },
  set(v) {
    if (section.value) {
      section.value.label = v ?? '';
    }
  },
});

const deleteSection = () => {
  app.model.ui.dynamicSections = app.model.ui.dynamicSections.filter((it) => it.id !== app.queryParams.id);
  app.navigateTo('/add-section');
};
</script>

<template>
  <PlBlockPage>
    <template #title>
      <PlEditableTitle
        v-model="label"
        placeholder="Title"
        max-width="400px"
        :max-length="150"
        :min-length="4"
      />
    </template>
    <PlRow>
      {{ section }}
    </PlRow>
    <PlRow>
      <PlBtnPrimary @click="deleteSection">Delete section</PlBtnPrimary>
    </PlRow>
  </PlBlockPage>
</template>
