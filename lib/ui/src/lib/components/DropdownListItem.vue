<script setup lang="ts">
import { computed } from 'vue';
import CheckboxUncheckedSvg from '@/lib/assets/images/24_checkbox-base.svg?raw';
import CheckboxCheckedSvg from '@/lib/assets/images/24_checkbox-checked.svg?raw';
import type { Option } from '@/lib/types';

const props = withDefaults(
  defineProps<{
    item: Option;
    isSelected: boolean;
    size: 'small' | 'medium';
    isHovered: boolean;
    useCheckbox?: boolean;
  }>(),
  {
    size: 'small',
    isSelected: false,
    isHovered: false,
    useCheckbox: false,
  },
);
const text = computed<string>(() => props.item['text']);
const classes = computed<string>(() => {
  const classItems: string[] = [];
  if (props.size === 'small') {
    classItems.push('dropdown-list-item__small');
  }
  if (props.isSelected) {
    classItems.push('dropdown-list-item__selected');
  }
  if (props.isHovered) {
    classItems.push('hovered-item');
  }
  return classItems.join(' ');
});
const checkboxClasses = computed(() => {
  const classes: string[] = ['dropdown-list-item__checkbox', 'flex-self-start'];
  if (props.isSelected) {
    classes.push('checked');
  }
  return classes.join(' ');
});
const checkbox = computed(() => (props.isSelected ? CheckboxCheckedSvg : CheckboxUncheckedSvg));
</script>
<template>
  <div :class="classes" class="dropdown-list-item">
    <!-- eslint-disable vue/no-v-html -->
    <div v-if="props.useCheckbox" :class="checkboxClasses" v-html="checkbox" />
    <!--eslint-enable-->
    <div class="dropdown-list-item__title text-s">{{ text }}</div>
    <div v-if="!props.useCheckbox && props.isSelected" class="dropdown-list-item__icon flex-self-start" />
  </div>
</template>
