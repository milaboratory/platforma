<script lang="ts" setup>
import { computed } from "vue";

const props = defineProps<{
  value: boolean | number | undefined;
}>();

const isLoader = computed(() => typeof props.value === "boolean" && props.value);

const progressWidth = computed(() => {
  const value = props.value;

  if (typeof value === "number") {
    if (value >= 1) {
      return undefined;
    }

    return (value * 100).toFixed(2) + "%";
  }

  return undefined;
});
</script>

<template>
  <div v-if="isLoader" data-testid="pl-block-loader" class="block__loader" />
  <div
    v-else-if="progressWidth !== undefined"
    data-testid="pl-block-loader-progress"
    class="block__progress"
    :style="{ '--progress-width': progressWidth }"
  />
</template>
