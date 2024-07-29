<script lang="ts" setup>
import { computed } from 'vue';
import { injectState } from './keys';

const state = injectState();

const selectedColumns = computed(() => state.getSelectedColumns());

const isVisible = computed(() => selectedColumns.value.length > 0);

const ops = computed(() => state.settings?.value.onSelectedColumns ?? []);

const actions = computed(() =>
  ops.value.map((op) => ({
    label: op.label,
    cb: () => {
      op.cb(selectedColumns.value);
      state.data.selectedColumns.clear();
    },
  })),
);
</script>

<template>
  <div v-if="isVisible" class="command-menu">
    <span v-if="selectedColumns.length">selected columns {{ selectedColumns.length }}</span>
    <hr />
    <span v-for="(action, i) in actions" :key="i" class="command" @click.stop="action.cb">{{ action.label }}</span>
  </div>
</template>
