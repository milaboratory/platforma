<script lang="ts" setup>
import type { blockDependenciesPlugin, InferPluginHandle } from "@platforma-sdk/model";
import { PlAlert } from "@milaboratories/uikit";
import { computed } from "vue";
import { usePlugin } from "../../composition/usePlugin";
import { PlBlockName } from "../PlBlockName";
import { linkAlerts, linkSections } from "./utils";

const props = defineProps<{
  handle: InferPluginHandle<typeof blockDependenciesPlugin>;
}>();

const plugin = usePlugin(props.handle);

const alerts = computed(() => {
  const { dependents, dependencies } = plugin.model.outputs;
  return linkAlerts(
    linkSections({
      dependents: dependents?.ok ? dependents.value : undefined,
      dependencies: dependencies?.ok ? dependencies.value : undefined,
    }),
  );
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
