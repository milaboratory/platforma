<script lang="ts" setup>
import type { MaskIconName16, Size } from '@/types';
import BtnBase from '@/base/BtnBase.vue';

const props = defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  round?: boolean;
  icon?: MaskIconName16;
  reverse?: boolean;
  justifyCenter?: boolean;
  hover?: boolean;
}>();
</script>

<template>
  <BtnBase v-bind="props" class="ui-btn-secondary">
    <slot />
  </BtnBase>
</template>
