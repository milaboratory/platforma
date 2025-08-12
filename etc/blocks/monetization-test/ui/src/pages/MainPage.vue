<script setup lang="ts">
import type { ImportFileHandle } from '@platforma-sdk/model';
import { getFileNameFromHandle } from '@platforma-sdk/model';
import type { ImportedFiles, ListOption } from '@platforma-sdk/ui-vue';
import {
  PlDialogModal,
  PlLogView,
  PlAlert,
  PlBlockPage,
  PlBtnPrimary,
  PlCheckbox,
  PlDropdownMulti,
  PlFileDialog,
  PlFileInput,
  PlRow,
  PlTextField,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import { reactive, ref, watch } from 'vue';
import { parseToken, verify } from '../tokens';

const app = useApp();

const dropdownOptions: ListOption<string>[] = [
  {
    text: 'sha256',
    value: 'sha256',
  },
  {
    text: 'lines (only in .zip files)',
    value: 'lines',
  },
  {
    text: 'size',
    value: 'size',
  },
];

const files = reactive<{
  isMultiDialogFileOpen: boolean;
}>({
  isMultiDialogFileOpen: false,
});

const updateHandle = (v: ImportFileHandle | undefined, i: number) => {
  if (v) {
    app.model.args.inputHandles[i].handle = v;
  } else {
    app.model.args.inputHandles.splice(i, 1);
  }
};

const onImport = (imported: ImportedFiles) => {
  app.model.args.inputHandles = imported.files.map((h, i) => ({
    handle: h,
    fileName: getFileNameFromHandle(h),
    argName: `arg_${i}`,
    options: ['size', 'sha256'],
  }));
};

const verificationResult = ref('');

const isDialogFileOpen = ref(false);

const isTokenDialogOpen = ref(false);

const tokensResult = ref<string>('');

watch(() => app.model.outputs.tokens, async (tokens) => {
  tokensResult.value = (await Promise.all(tokens?.map(async (t) => {
    const result = await verify(t.value);
    return `token: ${t.value}\nresult: ${result}\n${JSON.stringify(parseToken(t.value), null, 2)}\n\n`;
  }) ?? [])).join('\n') ?? '';
});
</script>

<template>
  <PlBlockPage>
    <template #title>
      Monetization example
    </template>

    <PlTextField
      v-model="app.model.args.productKey"
      label="Enter product key" clearable
    />

    <PlCheckbox v-model="app.model.args.shouldAddRunPerFile"> Add run per file </PlCheckbox>

    <PlRow width="400px">
      <PlBtnPrimary @click="files.isMultiDialogFileOpen = true">
        Open multiple files to monetize
      </PlBtnPrimary>
      <PlBtnPrimary :disabled="!app.model.outputs['__mnzInfo']" @click="isDialogFileOpen = true">
        Show mnz info
      </PlBtnPrimary>
    </PlRow>
    <template v-for="({ handle }, i) of app.model.args.inputHandles" :key="i">
      <PlRow>
        <PlTextField v-model="app.model.args.inputHandles[i].fileName" label="Type file name" />
        <PlTextField v-model="app.model.args.inputHandles[i].argName" label="Type argument name" />
        <PlFileInput
          :model-value="handle"
          @update:model-value="(v: ImportFileHandle | undefined) => updateHandle(v, i)"
        />
        <PlDropdownMulti
          v-model="app.model.args.inputHandles[i].options" label="Metrics to monetize"
          :options="dropdownOptions"
        />
      </PlRow>
    </template>

    <PlRow>
      <PlBtnPrimary @click="isTokenDialogOpen = true">
        Show tokens
      </PlBtnPrimary>
    </PlRow>

    <PlAlert v-if="verificationResult" label="token verification"> {{ verificationResult }}</PlAlert>
  </PlBlockPage>

  <PlFileDialog v-model="files.isMultiDialogFileOpen" multi @import:files="onImport" />

  <PlDialogModal v-model="isDialogFileOpen" size="medium">
    <template #title>
      Monetization info
    </template>
    <PlLogView :value="JSON.stringify(app.model.outputs['__mnzInfo'], null, 2)" />
  </PlDialogModal>

  <PlDialogModal v-model="isTokenDialogOpen" size="medium">
    <template #title>
      Tokens
    </template>
    <PlLogView
      :value="tokensResult"
    />
  </PlDialogModal>
</template>
