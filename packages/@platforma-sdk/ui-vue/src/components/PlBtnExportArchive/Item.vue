<script setup lang="ts">
import type { ExportItem } from "./types";
import { prettyBytes } from "@milaboratories/helpers";

defineProps<{
  item: ExportItem;
}>();
</script>

<template>
  <div :class="$style.item">
    <div :class="$style.name">{{ item.fileName }}</div>
    <div v-if="item.status === 'in-progress'" :class="$style.details">
      <span>{{ prettyBytes(item.current, {}) }}</span>
      <span>/</span>
      <span>{{ prettyBytes(item.size, {}) }}</span>
    </div>
    <div v-else-if="item.status === 'completed'" :class="$style.details">
      Done <span>{{ prettyBytes(item.size, {}) }}</span>
    </div>
    <div v-else-if="item.status === 'error'" :class="$style.error">
      <span>{{ item.error }}</span>
    </div>
    <div v-else :class="$style.details">Pending</div>
  </div>
</template>

<style module>
.item {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  overflow: hidden;
  --name-font-size: 12px;
  --details-font-size: 10px;
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

.error {
  font-size: var(--details-font-size);
  font-weight: 400;
  color: var(--txt-error);
  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
}
</style>
