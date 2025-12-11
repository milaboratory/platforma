<script setup lang="ts">
import type { RemoteBlobHandleAndSize } from '@platforma-sdk/model';
import { getFileNameFromHandle, type ImportFileHandle } from '@platforma-sdk/model';
import type { ImportedFiles } from '@platforma-sdk/ui-vue';
import { PlBtnExportArchive } from '@platforma-sdk/ui-vue';
import {
  PlBlockPage,
  PlContainer,
  PlRow,
  PlFileInput,
  PlCheckbox,
  PlBtnPrimary,
  PlFileDialog,
  PlAlert,
} from '@platforma-sdk/ui-vue';
import { computed, reactive } from 'vue';
import { useApp } from './app';

const app = useApp();

const data = reactive({
  closeOnOutsideClick: true,
  isMultiDialogOpen: false,
});

const fileExports = computed(() => {
  return Object.entries(app.model.outputs.fileExports as Record<ImportFileHandle, RemoteBlobHandleAndSize | undefined>).map(([importHandle, blobHandle]) => ({
    importHandle: importHandle as ImportFileHandle,
    blobHandle: blobHandle as RemoteBlobHandleAndSize,
    fileName: getFileNameFromHandle(importHandle as ImportFileHandle),
  }));
});

const onImport = (imported: ImportedFiles) => {
  app.model.args.inputHandles = imported.files;
};

// const extensions = ['.png', '.jpg', '.fastq.gz', '.fastq.gz'];

const updateHandle = (v: ImportFileHandle | undefined, i: number) => {
  if (v) {
    app.model.args.inputHandles[i] = v;
  } else {
    app.model.args.inputHandles.splice(i, 1);
  }
};

const handlesAndProgress = computed(() => {
  return app.model.args.inputHandles.map((h) => ({
    handle: h,
    progress: app.model.outputs.fileImports?.[h],
  }));
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>Transfer files 5</template>
    <template #append>
      <PlBtnExportArchive
        :debug="true"
        :file-exports="fileExports"
        :disabled="app.model.outputs.fileImports === undefined"
        :suggested-file-name="`${new Date().toISOString().split('T')[0]}_TransferFiles.zip`"
      >
        Export files
      </PlBtnExportArchive>
    </template>
    <PlRow>
      <PlCheckbox v-model="data.closeOnOutsideClick">Close File dialog on outside click</PlCheckbox>
    </PlRow>
    <PlRow v-if="false">
      <PlAlert type="success">
        File imports:
        {{ app.model.outputs.fileImports }}
      </PlAlert>
    </PlRow>
    <PlRow v-if="false">
      <PlAlert type="success">
        Input file handles:
        {{ app.model.args.inputHandles }}
      </PlAlert>
    </PlRow>
    <PlRow>
      <PlContainer width="400px">
        <PlBtnPrimary @click="data.isMultiDialogOpen = true">
          Open multiple files
        </PlBtnPrimary>
        <template v-for="({ handle, progress }, i) of handlesAndProgress" :key="i">
          <PlFileInput :model-value="handle" :progress="progress" @update:model-value="(v) => updateHandle(v, i)" />
        </template>
      </PlContainer>
    </PlRow>
  </PlBlockPage>
  <PlFileDialog
    v-model="data.isMultiDialogOpen"
    multi
    @import:files="onImport"
  />
</template>
