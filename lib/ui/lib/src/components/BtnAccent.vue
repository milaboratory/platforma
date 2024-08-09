<script lang="ts" setup>
import type { MaskIconName16, Size } from '@/types';
import BtnBase from '@/components/btn/BtnBase.vue';

const props = defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  round?: boolean;
  icon?: MaskIconName16;
  reverse?: boolean;
  justifyCenter?: boolean;
}>();
</script>

<template>
  <btn-base class="ui-btn-accent" v-bind="props">
    <slot />
  </btn-base>
</template>
