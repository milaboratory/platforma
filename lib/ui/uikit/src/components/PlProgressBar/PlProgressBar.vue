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
  <div v-if="loading" class="ui-progress-bar">
    <div class="ui-progress-bar__indicator" :style="{ width: progress + '%' }"/>
    <div class="ui-progress-bar__messages d-flex align-center pl-6 pr-6">
      <div class="ui-progress-bar__message flex-grow-1">{{ readyMsg }}</div>
      <div class="ui-progress-bar__percent">{{ progress + '%' }}</div>
    </div>
  </div>
</template>
