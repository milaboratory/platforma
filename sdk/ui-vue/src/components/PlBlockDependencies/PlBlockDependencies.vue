<script lang="ts" setup>
import { PlAlert, PlMaskIcon16 } from "@milaboratories/uikit";
import { uniq } from "es-toolkit";
import { computed, inject } from "vue";
import { columnLinksKey } from "../../columnLinks";
import { linkAlerts, linkSections } from "../../columnLinkViews";
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

const isFolded = computed(() => usedByFold.state.value.type === "folded");

const isUpdated = computed(() => {
  const state = usedByFold.state.value;
  return state.type === "folded" && state.updated;
});

const blockCount = computed(() => {
  const count = uniq(usedByIssues.value.map((issue) => issue.blockId)).length;
  return `${count} ${count === 1 ? "block" : "blocks"}`;
});

const toggleUsedBy = () => (isFolded.value ? usedByFold.open() : usedByFold.fold());
</script>

<template>
  <PlAlert
    v-for="alert in alerts"
    :key="alert.side"
    :data-testid="`pl-block-dependencies-alert-${alert.side}`"
    :type="alert.type"
    :label="alert.label"
  >
    <template v-if="alert.side === 'usedBy'" #label>
      <button
        type="button"
        data-testid="pl-block-dependencies-toggle"
        :class="$style.title"
        :aria-expanded="!isFolded"
        @click="toggleUsedBy"
      >
        <PlMaskIcon16
          name="chevron-right"
          :class="[$style.chevron, { [$style.open]: !isFolded }]"
        />
        {{ alert.label }}
        <span v-if="isFolded" data-testid="pl-block-dependencies-count" :class="$style.meta">
          {{ blockCount }}
        </span>
        <span v-if="isUpdated" data-testid="pl-block-dependencies-updated" :class="$style.meta">
          <span :class="$style.dot" />Updated
        </span>
      </button>
    </template>
    <template v-if="alert.side !== 'usedBy' || !isFolded" #default>
      <ul :class="$style.issues">
        <li v-for="issue in alert.issues" :key="issue.key" :title="issue.outputs.join(', ')">
          <PlBlockName :block-id="issue.blockId" :name="issue.blockName" />
          {{ issue.text }}
        </li>
      </ul>
      <div v-if="alert.hint !== null" :class="$style.hint">{{ alert.hint }}</div>
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
.title {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  cursor: pointer;
}
.title:focus-visible {
  outline: 2px solid var(--border-color-focus);
  outline-offset: 2px;
}
.chevron {
  transition-duration: 50ms;
}
.open {
  transform: rotate(90deg);
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  line-height: 20px;
  color: var(--txt-03);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--txt-link);
}
</style>
