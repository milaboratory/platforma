<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    loading: boolean;
    progress: number;
    completeMessage: string;
  }>(),
  { progress: 0, completeMessage: "Completed" },
);

const readyMsg = computed(() => (props.progress === 100 ? props.completeMessage : ""));
</script>

<template>
  <div v-if="loading" data-testid="pl-progress-bar" class="ui-progress-bar">
    <div
      data-testid="pl-progress-bar-indicator"
      class="ui-progress-bar__indicator"
      :style="{ width: progress + '%' }"
    />
    <div class="ui-progress-bar__messages d-flex align-center pl-6 pr-6">
      <div data-testid="pl-progress-bar-message" class="ui-progress-bar__message flex-grow-1">
        {{ readyMsg }}
      </div>
      <div data-testid="pl-progress-bar-percent" class="ui-progress-bar__percent">
        {{ progress + "%" }}
      </div>
    </div>
  </div>
</template>
