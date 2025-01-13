<script setup lang="ts">
import {
  PlBlockPage,
  PlContainer,
  PlEditableTitle,
  PlRow,
  PlBtnPrimary,
  PlCloseModalBtn,
  PlDropdownLine,
  PlTextField,
  PlBtnGhost,
  Color,
} from '@platforma-sdk/ui-vue';
import { computed, reactive, ref } from 'vue';

const data = reactive({
  title: 'Title example',
  importHandles: [] as unknown[],
  value: 1,
  options: [{
    label: 'Test Label',
    value: 1,
  }, {
    label: 'Test label 2',
    value: 2,
  }, {
    label: 'Test label 3',
    value: 3,
  }],
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

const currentLabel = computed({
  get() {
    return data.options.find((o) => o.value === data.value)?.label;
  },
  set(v) {
    const opt = data.options.find((o) => o.value === data.value);
    if (opt) {
      opt.label = v ?? '';
    }
  },
});

const loading = ref(false);

const onClickSettings = () => {
  loading.value = true;
  setTimeout(() => loading.value = false, 2000);
};

const triggerError = () => {
  Color.fromString('invalid color');
};
</script>

<template>
  <PlBlockPage :class="$style.components" style="max-width: 100%">
    <template #title>
      <PlEditableTitle
        v-model="data.title"
        placeholder="Title"
        max-width="400px"
        :max-length="15"
        :min-length="4"
      />
    </template>
    <template #append>
      <PlBtnGhost icon="settings" :loading="loading" @click="onClickSettings">Settings</PlBtnGhost>
      <PlBtnPrimary> Just a button</PlBtnPrimary>
    </template>
    <PlRow>
      <div :class="$style['drag-and-drop']" @drop="onDrop" @dragover.prevent>Drag & Drop</div>
    </PlRow>
    <PlRow>
      <PlContainer>
        <h4>Import Handles</h4>
        <pre>{{ data.importHandles }}</pre>
      </PlContainer>
    </PlRow>
    <PlRow> <PlCloseModalBtn /> </PlRow>
    <PlRow> <PlTextField v-model="currentLabel" label="Change title" :clearable="() => undefined" /> </PlRow>
    <PlRow>
      <PlDropdownLine v-model="data.value" clearable :label="data.title" :options="data.options" />
      <PlDropdownLine v-model="data.value" prefix="Option:" clearable :label="data.title" :options="data.options" />
    </PlRow>
    <PlRow>
      <PlBtnPrimary @click="triggerError">Trigger ui vue error</PlBtnPrimary>
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
