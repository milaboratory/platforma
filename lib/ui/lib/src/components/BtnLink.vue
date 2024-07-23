<script lang="ts" setup>
import type { MaskIconName, Size } from '@/types';
import BtnSecondary from '@/components/BtnSecondary.vue';
import { ref } from 'vue';

const props = defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  icon: MaskIconName;
  reverse?: boolean;
  justifyCenter?: boolean;
  disabled?: boolean;
}>();

const hover = ref(false);
</script>

<template>
  <div class="ui-btn-link" :class="{ disabled, loading, hover }" @mouseover="hover = true" @mouseleave="hover = false">
    <btn-secondary round :hover="hover" v-bind="props" />
    <slot />
  </div>
</template>
