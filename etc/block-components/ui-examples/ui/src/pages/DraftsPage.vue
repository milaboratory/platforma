<script setup lang="ts">
import { PlBlockPage, PlContainer, PlRow } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  importHandles: [] as unknown[]
});

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
    <template #title>Drafts</template>
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
