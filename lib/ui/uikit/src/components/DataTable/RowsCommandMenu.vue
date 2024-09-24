<script lang="ts" setup>
import { computed } from 'vue';
import { injectState } from './keys';

const state = injectState();

const selectedRows = computed(() => state.getSelectedRows());

const isVisible = computed(() => selectedRows.value.length > 0);

const ops = computed(() => state.settings?.value.onSelectedRows ?? []);

const actions = computed(() =>
  ops.value.map((op) => ({
    label: op.label,
    cb: () => {
      op.cb(selectedRows.value);
      state.data.selectedRows.clear();
      state.data.rows = [];
    },
  })),
);
</script>

<template>
  <div v-if="isVisible" class="command-menu">
    <span v-if="selectedRows.length">{{ selectedRows.length }} rows selected</span>
    <hr />
    <span v-for="(action, i) in actions" :key="i" class="command" @click.stop="action.cb">{{ action.label }}</span>
  </div>
</template>
