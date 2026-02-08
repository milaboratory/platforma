<script setup lang="ts">
import type { ExportItem } from "./types";
import { prettyBytes } from "@milaboratories/helpers";

defineProps<{
  item: ExportItem;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
}>();
</script>

<template>
  <div :class="$style.summary">
    <div :class="$style.name">
      {{ item.fileName }}<span v-if="false" @click.stop="emit('cancel')">[TODO: Cancel]</span>
    </div>
    <div v-if="item.status === 'in-progress'" :class="$style.details">
      <span>{{ prettyBytes(item.current, {}) }}</span>
      <span>/</span>
      <span>{{ prettyBytes(item.size, {}) }}</span>
    </div>
    <div v-else-if="item.status === 'completed'" :class="$style.details">
      Done <span>{{ prettyBytes(item.size, {}) }}</span>
    </div>
    <div v-else :class="$style.details">Pending</div>
  </div>
</template>

<style module>
.summary {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
  --name-font-size: 14px;
  --details-font-size: 12px;
}

.name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--name-font-size);
  font-weight: 600;
}
.details {
  font-size: var(--details-font-size);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.6);
}
</style>
