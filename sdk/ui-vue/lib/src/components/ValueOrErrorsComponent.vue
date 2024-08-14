<script setup lang="ts" generic="T">
import { computed } from 'vue';
import type { ValueOrErrors } from '@milaboratory/sdk-ui';

const props = defineProps<{
  valueOrError: ValueOrErrors<T> | undefined;
}>();

const value = computed(() => (props.valueOrError && props.valueOrError.ok ? props.valueOrError.value : undefined));

const error = computed(() => (props.valueOrError && !props.valueOrError.ok ? props.valueOrError.errors : undefined));

const isUnresolved = computed(() => value.value === undefined && error.value === undefined);

defineSlots<{
  default(props: { value: T }): void;
}>();
</script>

<template>
  <div>
    <slot v-if="value !== undefined" name="default" v-bind="{ value }" />
    <div v-if="error" class="alert-error">
      {{ error }}
    </div>
    <div v-if="isUnresolved">Unresolved</div>
  </div>
</template>
