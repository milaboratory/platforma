<script lang="ts" setup>
import { computed } from 'vue';
import CheckboxUncheckedSvg from '../assets/images/24_checkbox-light-enabled-unchecked.svg?raw';
import CheckboxCheckedSvg from '../assets/images/24_checkbox-light-enabled-checked.svg?raw';
import type { ListOptionNormalized } from '../types';

const props = withDefaults(
  defineProps<{
    option: ListOptionNormalized;
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

// Why??
const checkboxSvg = computed(() => (props.isSelected ? CheckboxCheckedSvg : CheckboxUncheckedSvg));
</script>

<template>
  <div :class="classes" class="dropdown-list-item">
    <!-- eslint-disable vue/no-v-html -->
    <div v-if="props.useCheckbox" :class="checkboxClasses" v-html="checkboxSvg" />
    <!--eslint-enable-->
    <div class="dropdown-list-item__title-container">
      <div class="dropdown-list-item__title text-s">
        {{ option.label }}
      </div>
      <div v-if="option.description" class="dropdown-list-item__description text-description">
        {{ option.description }}
      </div>
    </div>
    <div v-if="!props.useCheckbox && props.isSelected" class="dropdown-list-item__icon flex-self-start" />
  </div>
</template>
