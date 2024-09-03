<script lang="ts" setup>
import type { MaskIconName16, Size } from '@/types';
import BtnSecondary from '@/components/PlBtnSecondary/PlBtnSecondary.vue';
import { ref } from 'vue';

const props = defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  icon: MaskIconName16;
  reverse?: boolean;
  justifyCenter?: boolean;
  disabled?: boolean;
}>();

const hover = ref(false);
</script>

<template>
  <div class="ui-btn-link" :class="{ disabled, loading, hover }" @mouseover="hover = true" @mouseleave="hover = false">
    <BtnSecondary round :hover="hover" v-bind="props" />
    <slot />
  </div>
</template>
