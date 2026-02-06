<script lang="ts" setup>
import { computed, onErrorCaptured, ref, onBeforeUpdate } from "vue";
import { PlErrorAlert } from "../PlErrorAlert";
import { isErrorLike, tryDo } from "@milaboratories/helpers";

const extractMessage = (err: unknown): undefined | string => {
  if (err == null) {
    return undefined;
  }

  if (isErrorLike(err)) {
    return err.stack == null || err.stack.length === 0
      ? err.message
      : err.stack.includes(err.message)
        ? err.stack
        : err.message + "\n" + err.stack;
  }

  return tryDo(
    () => JSON.stringify(err, null, 4),
    () => err.toString(),
  );
};

const data = ref<null | {
  title: undefined | string;
  error: Error;
}>(null);

const error = computed(() => data.value?.error);
const message = computed(() => extractMessage(error.value));

function reset() {
  data.value = null;
}

const errorAlert = ref<InstanceType<typeof PlErrorAlert> | null>(null);

onBeforeUpdate(() => {
  // If an error is currently displayed, and the component updates (e.g., due to slot content changing),
  // reset the error state.
  if (data.value !== null && errorAlert.value) {
    reset();
  }
});

onErrorCaptured((err, instance) => {
  data.value = {
    title: instance?.$?.type?.name ?? undefined,
    error: err,
  };
  // stop error propagation
  return false;
});

defineExpose({ error, reset });
</script>

<template>
  <slot />
  <PlErrorAlert v-if="error" ref="errorAlert" :message="message" :title="data?.title" />
</template>
