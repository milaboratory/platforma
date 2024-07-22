<script lang="ts" setup>
import type { MaskIconName, Size } from '@/lib/types';
import BtnBase from '@/lib/components/btn/BtnBase.vue';

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
