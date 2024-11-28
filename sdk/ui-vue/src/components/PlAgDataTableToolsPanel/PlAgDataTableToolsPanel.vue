<script setup lang="ts">
import { PlAgDataTableToolsPanelId } from './PlAgDataTableToolsPanelId';
/**
 * The PlAgDataTableToolsPanel component serves as a container for
 * buttons/actions related to table management.
 * It acts as a teleport target, allowing you to dynamically add controls,
 * such as buttons for managing columns, from component PlAgDataTable.
 */
</script>

<template>
  <div :id="PlAgDataTableToolsPanelId" class="d-flex gap-6">
    <slot></slot>
  </div>
</template>
