<script setup lang="ts">
import {
  PlBlockPage,
  PlBtnPrimary,
  PlContainer,
  PlRow,
  PlTextField,
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';
import { useApp } from '../app';

const data = reactive({
  label: '',
});

const create = async () => {
  const id = useApp().createSection(data.label);
  // @TODO await app.awaitSync or something like that
  await useApp().navigateTo(`/section?id=${id}`);
};
</script>

<template>
  <PlBlockPage>
    <template #title>
      Add dynamic section (name it "Error" to trigger an error in block model sections)
    </template>
    <PlRow>
      <PlContainer width="400px">
        <PlTextField v-model="data.label" label="Enter section label" />
      </PlContainer>
    </PlRow>
    <PlRow>
      <PlBtnPrimary :disabled="!data.label.trim()" @click="create">Create</PlBtnPrimary>
    </PlRow>
  </PlBlockPage>
</template>
