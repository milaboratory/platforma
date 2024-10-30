<script setup lang="ts">
import type { ImportFileHandle } from '@platforma-sdk/model';
import { PlBlockPage, PlContainer, PlRow, PlFileInput } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const dialogData = reactive({
  fileHandle: undefined as ImportFileHandle | undefined
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Modals</template>
    <PlRow>
      <PlContainer width="50%" @click.stop>
        <PlFileInput v-model="dialogData.fileHandle" label="Select file" />
      </PlContainer>
    </PlRow>
  </PlBlockPage>
</template>
