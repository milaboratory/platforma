<script setup lang="ts">
import type { ImportFileHandle } from '@platforma-sdk/model';
import { PlBlockPage, PlContainer, PlRow, PlFileInput, PlCheckbox } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  fileHandle: undefined as ImportFileHandle | undefined,
  closeOnOutsideClick: true
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Select file</template>
    <PlRow>
      <PlContainer width="50%" @click.stop>
        <PlFileInput
          v-model="data.fileHandle"
          label="Select file"
          :file-dialog-close-on-outside-click="data.closeOnOutsideClick"
        />
      </PlContainer>
    </PlRow>
    <PlRow>
      <PlCheckbox v-model="data.closeOnOutsideClick">Close File dialog on outside click</PlCheckbox>
    </PlRow>
  </PlBlockPage>
</template>
