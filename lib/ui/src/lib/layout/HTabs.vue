<script lang="ts" setup>
import { computed } from 'vue';

defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: unknown;
  options: readonly {
    text: string;
    value: unknown;
  }[];
}>();

const optionsRef = computed(() =>
  (props.options ?? []).map((o) => ({
    ...o,
    active: o.value === props.modelValue,
  })),
);
</script>

<template>
  <div class="h-tabs">
    <div
      v-for="(opt, i) in optionsRef"
      :key="i"
      class="h-tabs__it"
      :class="{ active: opt.active }"
      @click.stop="$emit('update:modelValue', opt.value)"
    >
      {{ opt.text }}
    </div>
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.h-tabs {
  --bottom-color: var(--color-div-grey);
  --color: var(--color-txt-03);

  font-weight: 600;
  font-size: 13px;
  line-height: 14px;
  display: flex;
  align-items: center;
  gap: 2px;
  letter-spacing: 0.04em;
  text-transform: uppercase;

  &__it {
    padding: 10px 12px;
    height: 40px;
    border-bottom: 2px solid var(--bottom-color);
    color: var(--color);
    cursor: pointer;

    &.active {
      --bottom-color: var(--color-focus);
      --color: var(--color-txt-01);
      cursor: default;
    }
  }
}
</style>
