<script setup lang="ts">
import {
  PlBlockPage,
  PlContainer,
  PlRow,
  PlBtnGroup,
  PlCheckboxGroup
} from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  text: '',
  single: 1,
  multiple: [1, 2],
  importHandles: [] as unknown[]
});

const options = [
  {
    label: 'A',
    value: 1
  },
  {
    label: 'B',
    value: 2
  },
  {
    label: 'C',
    value: 3
  },
  {
    label: 'D',
    value: 4
  }
];

const onDrop = (ev: DragEvent) => {
  [...(ev.dataTransfer?.files ?? [])].forEach((file, i) => {
    if (file) {
      console.log(`… file[${i}].name = ${file?.name}`);
      window.platforma?.lsDriver?.fileToImportHandle(file).then((handle) => {
        data.importHandles.push(handle);
      });
    }
  });
};
</script>

<template>
  <PlBlockPage :class="$style.components" style="max-width: 100%">
    <template #title>Form components</template>
    <PlRow>
      <PlContainer width="400px">
        <PlRow>
          <PlBtnGroup v-model="data.single" label="PlBtnGroup" :options="options" />
        </PlRow>
        <PlRow>
          <PlCheckboxGroup v-model="data.multiple" label="PlCheckboxGroup" :options="options" />
        </PlRow>
      </PlContainer>
      <PlContainer width="400px">
        <pre>{{ data }}</pre>
      </PlContainer>
    </PlRow>
    <PlRow>
      <div :class="$style['drag-and-drop']" @drop="onDrop" @dragover.prevent>Drag & Drop</div>
    </PlRow>
    <PlRow>
      <PlContainer>
        <h4>Import Handles</h4>
        <pre>{{ data.importHandles }}</pre>
      </PlContainer>
    </PlRow>
  </PlBlockPage>
</template>

<style module>
.drag-and-drop {
  border: 1px solid var(--txt-01);
  padding: 24px;
  width: 600px;
}

.components pre {
  border: 1px solid var(--txt-01);
  padding: 12px;
  font-weight: bolder;
  overflow: auto;
  max-width: 50vw;
  background-color: #eeeeee55;
}
</style>
