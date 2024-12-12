<script setup lang="ts">
import type { ImportFileHandle } from '@platforma-sdk/model';
import type { ImportedFiles } from '@platforma-sdk/ui-vue';
import {
  PlBlockPage,
  PlContainer,
  PlRow,
  PlFileInput,
  PlCheckbox,
  PlBtnPrimary,
  PlFileDialog,
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  fileHandle: undefined as ImportFileHandle | undefined,
  fileList: [] as ImportFileHandle[],
  closeOnOutsideClick: true,
  isMultiDialogOpen: false,
});

const onImport = (imported: ImportedFiles) => {
  data.fileList = imported.files;
};

const extensions = ['.png', '.jpg', '.fastq.gz', '.fastq.gz'];

const updateHandle = (v: ImportFileHandle | undefined, i: number) => {
  if (v) {
    data.fileList[i] = v;
  } else {
    data.fileList.splice(i, 1);
  }
};
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
          :extensions="extensions"
        />
      </PlContainer>
    </PlRow>
    <PlRow>
      <PlCheckbox v-model="data.closeOnOutsideClick">Close File dialog on outside click</PlCheckbox>
    </PlRow>
    <PlRow>
      <PlContainer width="400px">
        <PlBtnPrimary @click="data.isMultiDialogOpen = true">
          Open multiple files {{ extensions }}
        </PlBtnPrimary>
        <template v-for="(handle, i) of data.fileList" :key="i">
          <PlFileInput :model-value="handle" @update:model-value="(v) => updateHandle(v, i)" />
        </template>
      </PlContainer>
    </PlRow>
  </PlBlockPage>
  <PlFileDialog
    v-model="data.isMultiDialogOpen"
    multi
    :extensions="extensions"
    @import:files="onImport"
  />
</template>
