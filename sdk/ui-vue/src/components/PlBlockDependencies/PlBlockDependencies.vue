<script lang="ts" setup>
import type { blockDependenciesPlugin, InferPluginHandle } from "@platforma-sdk/model";
import {
  PlAlert,
  PlBtnGhost,
  PlSlideModal,
  PlStatusTag,
  usePlBlockPageTitleTeleportTarget,
} from "@milaboratories/uikit";
import { computed, ref } from "vue";
import { usePlugin } from "../../composition/usePlugin";
import { PlBlockName } from "../PlBlockName";
import { describeColumn, describeValues, linkAlerts, linkSections } from "./utils";

const props = defineProps<{
  handle: InferPluginHandle<typeof blockDependenciesPlugin>;
}>();

const plugin = usePlugin(props.handle);
const teleportTarget = usePlBlockPageTitleTeleportTarget("PlBlockDependencies");
const showPanel = ref(false);

const sections = computed(() => {
  const { dependents, dependencies } = plugin.model.outputs;
  return linkSections({
    dependents: dependents?.ok ? dependents.value : undefined,
    dependencies: dependencies?.ok ? dependencies.value : undefined,
  });
});
const hasLinks = computed(() => sections.value.some((section) => section.rows.length > 0));
const alerts = computed(() => linkAlerts(sections.value));
const issueCount = computed(() =>
  alerts.value.reduce((count, alert) => count + alert.issues.length, 0),
);
const buttonLabel = computed(() =>
  issueCount.value > 0
    ? `Links to other blocks: ${issueCount.value} need attention`
    : "Links to other blocks",
);

function closePanel() {
  showPanel.value = false;
}
</script>

<template>
  <Teleport v-if="teleportTarget && hasLinks" :to="teleportTarget">
    <PlBtnGhost
      data-testid="pl-block-dependencies"
      :icon="issueCount > 0 ? 'link-disabled' : 'link'"
      :title="buttonLabel"
      :aria-label="buttonLabel"
      @click.stop="showPanel = true"
    >
      Links
    </PlBtnGhost>
  </Teleport>

  <PlAlert
    v-for="alert in alerts"
    :key="alert.side"
    :data-testid="`pl-block-dependencies-alert-${alert.side}`"
    :type="alert.type"
    :label="alert.label"
  >
    <ul :class="$style.issues">
      <li v-for="issue in alert.issues" :key="issue.key" :title="issue.outputs.join(', ')">
        <PlBlockName :block-id="issue.blockId" :name="issue.blockName" :on-open="closePanel" />
        {{ issue.text }}
      </li>
    </ul>
    <button type="button" :class="[$style.link, $style.showLinks]" @click.stop="showPanel = true">
      Show links
    </button>
  </PlAlert>

  <PlSlideModal v-model="showPanel" data-testid="pl-block-dependencies-panel" width="480px">
    <template #title>Links to other blocks</template>

    <div :class="$style.sections">
      <section v-for="section in sections" :key="section.side" :class="$style.section">
        <div :class="$style.sectionTitle">{{ section.title }}</div>
        <div v-if="section.note !== null" :class="$style.note">{{ section.note }}</div>
        <div v-if="section.rows.length === 0" :class="$style.note">{{ section.emptyText }}</div>
        <div v-for="row in section.rows" :key="row.key" :class="$style.row">
          <div :class="$style.rowText">
            <div :class="$style.block">
              <PlBlockName :block-id="row.blockId" :name="row.blockName" :on-open="closePanel" />
            </div>
            <div :title="row.output">{{ describeColumn(row) }}</div>
            <div :class="$style.values">{{ describeValues(row.values) }}</div>
            <div
              v-if="row.status.type === 'missingValues'"
              :class="{ [$style.error]: row.tag.type === 'ALERT' }"
            >
              Missing: {{ describeValues(row.status.values) }}
            </div>
          </div>
          <PlStatusTag :class="$style.tag" :type="row.tag.type" :title="row.tag.hint ?? undefined">
            {{ row.tag.text }}
          </PlStatusTag>
        </div>
      </section>
    </div>
  </PlSlideModal>
</template>

<style module>
.issues {
  margin: 0;
  padding-left: 20px;
}
.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--txt-link);
  font: inherit;
  text-align: inherit;
  cursor: pointer;
}
.link:hover {
  text-decoration: underline;
}
.link:focus-visible {
  outline: 2px solid var(--border-color-focus);
  outline-offset: 2px;
}
.showLinks {
  display: block;
  margin-top: 8px;
}
.sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sectionTitle {
  font-weight: 600;
}
.note {
  color: var(--txt-03);
}
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--border-color-div-grey);
}
.rowText {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.block {
  font-weight: 600;
}
.values {
  color: var(--txt-03);
}
.error {
  color: var(--txt-error);
}
.tag {
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
