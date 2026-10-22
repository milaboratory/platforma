<script lang="ts" setup>
import type { LinkAlert } from "@platforma-sdk/model";
import { linkAlerts, linkSections } from "@platforma-sdk/model";
import { PlAlert } from "@milaboratories/uikit";
import { uniq } from "es-toolkit";
import { computed, inject } from "vue";
import { columnLinksKey } from "../../columnLinks";
import { PlBlockName } from "../PlBlockName";
import { useAlertFold } from "./fold";

const links = inject(columnLinksKey, undefined);

const alerts = computed(() => {
  const value = links?.value;
  return value === undefined ? [] : linkAlerts(linkSections(value));
});

// Only the warning about other blocks folds: broken inputs of this block stop it from running.
const usedByIssues = computed(
  () => alerts.value.find((alert) => alert.side === "usedBy")?.issues ?? [],
);
const usedByFold = useAlertFold({
  blockId: () => links?.value?.blockId,
  issues: usedByIssues,
});

const isFolded = (alert: LinkAlert) =>
  alert.side === "usedBy" && usedByFold.state.value.type === "folded";

const isUpdated = computed(() => {
  const state = usedByFold.state.value;
  return state.type === "folded" && state.updated;
});

const showText = computed(() => {
  const count = uniq(usedByIssues.value.map((issue) => issue.blockId)).length;
  return `Show ${count} ${count === 1 ? "block" : "blocks"}`;
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
    <button
      v-if="isFolded(alert)"
      type="button"
      data-testid="pl-block-dependencies-show"
      :class="$style.toggle"
      @click="usedByFold.open()"
    >
      <span v-if="isUpdated" data-testid="pl-block-dependencies-updated" :class="$style.updated">
        <span :class="$style.dot" />Updated ·
      </span>
      {{ showText }}
    </button>
    <template v-else>
      <ul :class="$style.issues">
        <li v-for="issue in alert.issues" :key="issue.key" :title="issue.outputs.join(', ')">
          <PlBlockName :block-id="issue.blockId" :name="issue.blockName" />
          {{ issue.text }}
        </li>
      </ul>
      <div v-if="alert.hint !== null" :class="$style.hint">{{ alert.hint }}</div>
      <button
        v-if="alert.side === 'usedBy'"
        type="button"
        data-testid="pl-block-dependencies-hide"
        :class="[$style.toggle, $style.hide]"
        @click="usedByFold.fold()"
      >
        Hide
      </button>
    </template>
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
.toggle {
  padding: 0;
  border: none;
  background: none;
  color: var(--txt-link);
  font: inherit;
  cursor: pointer;
}
.hide {
  margin-top: 8px;
}
.updated {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--txt-link);
}
</style>
