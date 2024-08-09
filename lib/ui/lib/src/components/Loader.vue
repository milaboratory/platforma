<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    loading: boolean;
    progress: number;
    completeMessage: string;
  }>(),
  { progress: 0, completeMessage: 'Completed' },
);

const readyMsg = computed(() => (props.progress === 100 ? props.completeMessage : ''));
</script>

<template>
  <div v-if="loading" class="ui-loader">
    <div class="ui-loader__indicator" :style="{ width: progress + '%' }"></div>
    <div class="ui-loader__messages d-flex align-center pl-6 pr-6">
      <div class="ui-loader__message flex-grow-1">{{ readyMsg }}</div>
      <div class="ui-loader__percent">{{ progress + '%' }}</div>
    </div>
  </div>
</template>
