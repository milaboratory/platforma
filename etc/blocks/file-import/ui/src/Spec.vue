<script setup lang="tsx">
import type { Spec } from '@milaboratories/milaboratories.file-import-block.model';
import {
  PlTextField
} from '@platforma-sdk/ui-vue';
import { ref, watch } from 'vue';
import { useApp } from './app';
import AxesConfiguration from './components/AxesConfiguration.vue';
import ColumnsConfiguration from './components/ColumnsConfiguration.vue';
import { prepareSpec } from './utils/spec';

const app = useApp();
type MySpec = Pick<Spec, 'axes' | 'columns' | 'separator' | 'commentLinePrefix' | 'skipEmptyLines'>;

// Initialize reactive data
const formData = ref<MySpec>({
  separator: ',',
  commentLinePrefix: undefined,
  skipEmptyLines: false,
  axes: [],
  columns: []
});


// Watch for changes and update app.model.args.spec
watch(formData, (newValue) => {
  app.model.args.spec = prepareSpec(newValue);
}, { deep: true });

// Initialize from existing spec if available
if (app.model.args.spec) {
  formData.value = {
    separator: app.model.args.spec.separator || ',',
    commentLinePrefix: app.model.args.spec.commentLinePrefix,
    skipEmptyLines: app.model.args.spec.skipEmptyLines || false,
    axes: app.model.args.spec.axes || [],
    columns: app.model.args.spec.columns || []
  };
}
</script>

<template>
  <div :class="$style.specForm">
    <div :class="$style.sectionCol">
      <div :class="$style.sectionRow">
        <h3>Basic Settings</h3>
        <div :class="$style.formRow">
          <PlTextField :model-value="formData.separator || ''"
            @update:model-value="formData.separator = $event || undefined" label="Separator" placeholder="," />
          <PlTextField :model-value="formData.commentLinePrefix || ''"
            @update:model-value="formData.commentLinePrefix = $event || undefined" label="Comment Line Prefix"
            placeholder="#" />
        </div>
      </div>
    </div>

    <div :class="$style.sectionCol">
      <AxesConfiguration v-model="formData.axes" />
      <ColumnsConfiguration v-model="formData.columns" />
    </div>
  </div>
</template>

<style module>
.specForm {
  display: flex;
  flex-direction: row;
  gap: 12px;
}

.sectionRow {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 40px;
}

.sectionCol {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  gap: 12px;
}

.formRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
</style>