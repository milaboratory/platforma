<script lang="ts" setup>
import { linkAlerts, linkSections } from "@platforma-sdk/model";
import { PlAlert } from "@milaboratories/uikit";
import { computed, inject } from "vue";
import { columnLinksKey } from "../../columnLinks";
import { PlBlockName } from "../PlBlockName";

const links = inject(columnLinksKey, undefined);

const alerts = computed(() => {
  const value = links?.value;
  return value === undefined ? [] : linkAlerts(linkSections(value));
});
</script>

<template>
  <PlAlert
    v-for="alert in alerts"
    :key="alert.side"
    :data-testid="`pl-block-dependencies-alert-${alert.side}`"
    :type="alert.type"
    :label="alert.label"
  >
    <ul :class="$style.issues">
      <li v-for="issue in alert.issues" :key="issue.key" :title="issue.outputs.join(', ')">
        <PlBlockName :block-id="issue.blockId" :name="issue.blockName" />
        {{ issue.text }}
      </li>
    </ul>
    <div v-if="alert.hint !== null" :class="$style.hint">{{ alert.hint }}</div>
  </PlAlert>
</template>

<style module>
.issues {
  margin: 0;
  padding-left: 20px;
}
.hint {
  margin-top: 8px;
}
</style>
