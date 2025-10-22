<script setup lang="ts">
import {
  PlBtnGhost,
  PlIcon16,
  PlIcon24,
  useClickOutside,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import { ZipWriter } from '@zip.js/zip.js';
import { ChunkedStreamReader } from './ChunkedStreamReader';
import { reactive, computed, ref } from 'vue';
import type { ExportItem, ExportsMap } from './types';
import Item from './Item.vue';
import type { ImportFileHandle, RemoteBlobHandleAndSize } from '@platforma-sdk/model';
import { getFileNameFromHandle } from '@platforma-sdk/model';

const app = useApp();

const data = reactive({
  loading: false,
  name: '',
  exports: undefined as ExportsMap | undefined,
  showExports: false,
});

const isReadyToExport = computed(() => {
  return app.model.outputs.fileImports !== undefined;
});

const items = computed(() => {
  return Array.from(data.exports?.values() ?? []);
});

const archive = computed<ExportItem>(() => {
  return {
    fileName: data.name,
    current: items.value.reduce((acc, item) => acc + item.current, 0),
    size: items.value.reduce((acc, item) => acc + item.size, 0),
    status: items.value.some((item) => item.status === 'in-progress') ? 'in-progress' : items.value.every((item) => item.status === 'completed') ? 'completed' : 'pending',
  };
});

type ZipRequest = {
  id: string;
  fileName: string;
  size: number;
  stream: ChunkedStreamReader;
};

const exportRawTsvs = async () => {
  if (data.loading) {
    data.showExports = true;
    return;
  }

  if (!isReadyToExport.value) {
    return;
  }

  const fileExports = app.model.outputs.fileExports as Record<ImportFileHandle, RemoteBlobHandleAndSize> | undefined;
  if (fileExports === undefined) {
    return;
  }

  console.log('fileExports', JSON.stringify(fileExports, null, 2));

  // @ts-expect-error - showSaveFilePicker is not available in the browser
  const newHandle = await window.showSaveFilePicker({
    types: [{
      description: 'Any files',
    }],
    suggestedName: `${new Date().toISOString().split('T')[0]}_TransferFiles.zip`,
  });

  data.loading = true;
  data.name = newHandle.name;
  data.showExports = true;
  data.exports = new Map();

  const t1 = performance.now();

  try {
    const writableStream = await newHandle.createWritable();
    const zip = new ZipWriter(writableStream, { keepOrder: true, zip64: true, bufferedWrite: false });

    try {
      const requests = [] as ZipRequest[];

      for (const [importHandle, { handle, size }] of Object.entries(fileExports)) {
        const fileName = getFileNameFromHandle(importHandle as ImportFileHandle);
        data.exports?.set(handle, { fileName, current: 0, size, status: 'pending' });

        console.log('fileName', importHandle, fileName);
        console.log('size', size);
        console.log('handle', handle);

        // Create a chunked stream reader for efficient streaming
        requests.push({ id: handle, fileName, size, stream: new ChunkedStreamReader(handle, size) });
      }

      Promise.all(requests.map(async (request) => {
        const { id, fileName, size, stream } = request;
        const update = (partial: Partial<ExportItem>) => {
          const it = data.exports?.get(id);
          if (it) {
            data.exports?.set(id, { ...it, ...partial });
          }
        };
        return zip.add(fileName, stream.createStream(), {
          bufferedWrite: true,
          onstart: () => {
            update({ status: 'in-progress' });
            return undefined;
          },
          onprogress: (current: number) => {
            update({ current });
            return undefined;
          },
          onend() {
            update({ current: size, status: 'completed' });
            return undefined;
          },
        });
      }));
    } finally {
      await zip.close();
    }
  } finally {
    data.loading = false;
    const t2 = performance.now();
    console.log(`Time taken: ${t2 - t1} milliseconds`);
  }
};

const progressesRef = ref();

useClickOutside([progressesRef], () => {
  data.showExports = false;
});
</script>

<template>
  <PlBtnGhost
    :disabled="!isReadyToExport" :loading="data.loading" :class="{ [$style['has-exports']]: data.exports }"
    @click.stop="exportRawTsvs"
  >
    Export Raw Results
    <template #append>
      <PlIcon24 :class="$style.icon" name="download" />
    </template>
  </PlBtnGhost>
  <Teleport to="body">
    <div v-if="data.exports && data.showExports" ref="progressesRef" :class="$style.progresses">
      <PlIcon16 :class="$style.close" name="close" @click.stop="data.showExports = false" />
      <Item :item="archive" :class="$style.archive" />
      <div :class="$style.items" class="pl-scrollable-y">
        <Item v-for="item in data.exports?.values()" :key="item.fileName" :item="item" />
      </div>
    </div>
  </Teleport>
</template>

<style module>
.archive {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
  --name-font-size: 14px;
  --details-font-size: 12px;
}

.progresses {
  position: fixed;
  top: 8px;
  right: 8px;
  width: 350px;
  height: auto;
  max-height: 400px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 8px;
  padding: 20px 8px 8px 20px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  z-index: 1000;

  .items {
    max-height: 300px;
  }

  .close {
    position: absolute;
    top: 8px;
    right: 8px;
    cursor: pointer;
    --icon-color: white;
  }
}
</style>
