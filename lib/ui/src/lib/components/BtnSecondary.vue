<script lang="ts" setup>
import {MaskIconName, Size} from '@/lib/types';
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
  hover?: boolean;
}>();
</script>

<template>
  <btn-base v-bind="props" class="ui-btn-secondary">
    <slot/>
  </btn-base>
</template>
