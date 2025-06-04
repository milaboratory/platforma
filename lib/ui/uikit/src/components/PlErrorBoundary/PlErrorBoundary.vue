<script lang="ts" setup>
import { computed, onErrorCaptured, ref } from 'vue';
import { PlErrorAlert } from '@/components/PlErrorAlert';
import { isErrorLike, tryDo } from '@milaboratories/helpers';

const extractMessage = (err: unknown): undefined | string => {
  if (err == null) {
    return undefined;
  }

  if (isErrorLike(err)) {
    return err.stack == null || err.stack.length === 0
      ? err.message
      : err.stack.includes(err.message)
        ? err.stack
        : err.message + '\n' + err.stack;
  }

  return tryDo(() => JSON.stringify(err, null, 4), () => err.toString());
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
  <slot v-if="!error" />
  <slot
    v-else
    :error="error"
    :reset="reset"
    name="fallback"
  >
    <PlErrorAlert :message="message" :title="data?.title" />
  </slot>
</template>
