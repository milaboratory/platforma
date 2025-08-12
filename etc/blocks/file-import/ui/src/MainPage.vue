<script setup lang="ts">
import type { SpecUI } from '@milaboratories/milaboratories.file-import-block.model';
import type { LocalImportFileHandle } from '@milaboratories/pl-model-common';
import { PlBlockPage, PlBtnPrimary, PlFileInput, usePlBlockPageTitleTeleportTarget } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import Spec from './components/Spec.vue';
import { useMetadataXsv } from './hooks/useMetadataXsv';
import { autoFillSpecFromMetadata } from './utils/spec';

const teleportTarget = usePlBlockPageTitleTeleportTarget('PlAgGridColumnManager');
const app = useApp();

if (app.model.ui.spec === undefined) {
  app.model.ui.spec = {
    separator: ',',
    commentLinePrefix: undefined,
    skipEmptyLines: false,
    allowColumnLabelDuplicates: true,
    allowArtificialColumns: false,
    columnNamePrefix: undefined,
    storageFormat: 'Binary',
    partitionKeyLength: 0,
    index: undefined,
    axes: [],
    columns: [],
  } satisfies SpecUI;
}

const state = app.model.ui as typeof app.model.ui & {
  spec: SpecUI;
};

const metadata = useMetadataXsv(
  () => state.fileHandle as undefined | LocalImportFileHandle,
  () => state.spec?.separator,
);
const handleAutoFill = () => {
  if (metadata.value && state.spec) {
    autoFillSpecFromMetadata(metadata.value, state.spec);
  }
};
</script>

<template>
  <PlBlockPage>
    <template #title>
      File Import
    </template>

    <Teleport v-if="teleportTarget" :to="teleportTarget">
      <PlBtnPrimary icon="clipboard-copied" @click.stop="handleAutoFill">
        Auto fill
      </PlBtnPrimary>
    </Teleport>

    <PlFileInput
      v-model="app.model.ui.fileHandle"
      label="File csv/tsv"
      :extensions="['.csv', '.tsv']"
      :progress="app.model.outputs.fileUploader"
    />

    <Spec
      v-model="state.spec"
      :metadata="metadata"
    />
  </PlBlockPage>
</template>
