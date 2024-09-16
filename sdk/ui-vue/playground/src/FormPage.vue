<script lang="ts" setup>
import { reactive, watch } from 'vue';
// import { useApp } from './app';
import Navigate from './components/Navigate.vue';
import { PlFileInput, useInterval } from 'lib';
import { platforma } from './testApi';
import type { ImportProgress } from '@milaboratory/sdk-ui';

window.platforma = platforma;

const startProgress = () => ({
  done: false,
  isUpload: false,
  status: {
    progress: 0.0,
    bytesProcessed: 1200,
    bytesTotal: 10000,
  },
  lastError: undefined,
});

const data = reactive({
  model: undefined,
  progress: undefined as ImportProgress | undefined,
});

watch(
  () => data.model,
  (v) => {
    if (!v) {
      data.progress = startProgress();
    }
  },
);

useInterval(() => {
  if (!data.model) {
    return;
  }

  if (!data.progress) {
    data.progress = startProgress();
  }

  const status = data.progress.status;

  const progress = (status?.progress ?? 0) + 0.1;

  data.progress.status = {
    progress,
    bytesProcessed: status?.bytesProcessed,
    bytesTotal: status?.bytesTotal,
  };

  if (progress >= 1) {
    data.progress.done = true;
    data.progress.lastError = 'Something bad';
  }
}, 1000);
</script>

<template>
  <div class="test-container">
    <h3>Form</h3>
    <Navigate />

    <div class="test-container">
      <PlFileInput v-model:model-value="data.model" :progress="data.progress" label="File label" dashed />
    </div>
  </div>
</template>

<style lang="scss">
.test-container {
  width: 600px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
