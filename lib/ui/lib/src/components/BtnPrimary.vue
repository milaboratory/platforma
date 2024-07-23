<script lang="ts" setup>
import type { MaskIconName, Size } from '@/types';
import BtnBase from '@/components/btn/BtnBase.vue';

const props = defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  round?: boolean;
  icon?: MaskIconName;
  reverse?: boolean;
  justifyCenter?: boolean;
}>();
</script>

<template>
  <btn-base class="ui-btn-primary" v-bind="props">
    <slot />
  </btn-base>
</template>
