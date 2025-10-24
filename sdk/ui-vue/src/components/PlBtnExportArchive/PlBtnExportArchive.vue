<script setup lang="ts">
import {
  PlBtnGhost,
  PlIcon16,
  PlIcon24,
  useClickOutside,
} from '@platforma-sdk/ui-vue';
import { ZipWriter } from '@zip.js/zip.js';
import { reactive, computed, ref } from 'vue';
import type { ExportItem, ExportsMap, FileExportEntry } from './types';
import Item from './Item.vue';
import { getFileNameFromHandle, ChunkedStreamReader } from '@platforma-sdk/model';
import { getRawPlatformaInstance } from '@platforma-sdk/model';
import { uniqueId } from '@milaboratories/helpers';
import { shallowRef } from 'vue';
import Summary from './Summary.vue';

type FilePickerAcceptType = {
  description?: string;
  accept?: Record<string, string[]>;
};

const props = defineProps<{
  fileExports?: FileExportEntry[];
  suggestedFileName?: string;
  disabled?: boolean;
  filePickerTypes?: FilePickerAcceptType[];
  debug?: boolean;
}>();

const defaultData = () => ({
  loading: false,
  name: '',
  exports: undefined as ExportsMap | undefined,
  showExports: false,
});

const data = reactive(defaultData());

const resetData = () => {
  Object.assign(data, defaultData());
};

const cancel = shallowRef<() => void>();

const updateExportsItem = (id: string, partial: Partial<ExportItem>) => {
  const it = data.exports?.get(id);
  if (it) {
    data.exports?.set(id, { ...it, ...partial });
  }
};

const isReadyToExport = computed(() => {
  return props.fileExports !== undefined && !props.disabled;
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
    hasErrors: items.value.some((item) => item.status === 'error'),
  };
});

type ZipRequest = {
  id: string;
  fileName: string;
  size: number;
  stream: ReadableStream<Uint8Array>;
};

const exportRawTsvs = async () => {
  if (data.loading) {
    data.showExports = true;
    return;
  }

  if (!isReadyToExport.value || !props.fileExports) {
    return;
  }

  const defaultFileName = `${new Date().toISOString().split('T')[0]}_Export.zip`;
  const defaultTypes = [{
    description: 'ZIP files',
    accept: {
      'application/zip': ['.zip'],
    },
  }];

  // @ts-expect-error - type definition issue TODO: fix this
  const newHandle = await window.showSaveFilePicker({
    types: props.filePickerTypes || defaultTypes,
    suggestedName: props.suggestedFileName || defaultFileName,
  });

  data.loading = true;
  data.name = newHandle.name;
  data.showExports = true;
  data.exports = new Map();

  const t1 = performance.now();

  try {
    const writableStream = await newHandle.createWritable();
    const zip = new ZipWriter(writableStream, { keepOrder: true, zip64: true, bufferedWrite: false });
    cancel.value = () => {
      zip.close();
      resetData();
    };
    try {
      const requests = [] as ZipRequest[];

      for (const entry of props.fileExports) {
        const { importHandle, blobHandle, fileName: customFileName } = entry;
        const fileName = customFileName ?? getFileNameFromHandle(importHandle);
        const { handle, size } = blobHandle;

        const id = uniqueId();

        data.exports?.set(id, { fileName, current: 0, size, status: 'pending' });

        const stream = ChunkedStreamReader.create({
          fetchChunk: async ({ from, to }) => {
            if (props.debug) {
              if (Math.random() < 0.1) {
                throw new Error('Test error');
              }
            }

            return await getRawPlatformaInstance().blobDriver.getContent(handle, { from, to });
          },
          totalSize: size,
          onError: async (error) => {
            updateExportsItem(id, { status: 'error', error });
            await new Promise((resolve) => setTimeout(resolve, 1000)); // primitive for now
            return 'continue';
          },
        });

        // Create a chunked stream reader for efficient streaming
        requests.push({ id, fileName, size, stream });
      }

      await Promise.all(requests.map(async (request) => {
        const { id, fileName, size, stream } = request;
        const update = (partial: Partial<ExportItem>) => {
          const it = data.exports?.get(id);
          if (it) {
            data.exports?.set(id, { ...it, ...partial });
          }
        };
        return zip.add(fileName, stream, {
          bufferedWrite: true,
          onstart: () => {
            update({ status: 'in-progress' });
            return undefined;
          },
          onprogress: (current: number) => {
            update({ current, status: 'in-progress' });
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
      cancel.value = undefined;
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
    <slot />
    <template #append>
      <PlIcon24 :class="$style.icon" name="download" />
    </template>
  </PlBtnGhost>
  <Teleport to="body">
    <div v-if="data.exports && data.showExports" ref="progressesRef" :class="$style.progresses">
      <PlIcon16 :class="$style.close" name="close" @click.stop="data.showExports = false" />
      <Summary :item="archive" @cancel="cancel?.()" />
      <div :class="$style.itemsContainer" class="pl-scrollable-y">
        <Item v-for="item in data.exports?.values()" :key="item.fileName" :item="item" />
      </div>
    </div>
  </Teleport>
</template>

<style module>
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

  .itemsContainer {
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
