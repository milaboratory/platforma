<script lang="ts" setup>
import type { ListOptionNormalized } from '../../types';
import DropdownListItem from '../DropdownListItem.vue';
import { DropdownOverlay } from '../../utils/DropdownOverlay';
import GroupByList from '../../utils/GroupByList.vue';
import TextLabel from '../../utils/TextLabel.vue';
import { computed, useTemplateRef } from 'vue';

defineProps<{
  rootRef: HTMLElement;
  list: (ListOptionNormalized & { isSelected: boolean; isActive: boolean; index: number })[];
  optionSize: 'small' | 'medium';
  selectOption: (v: unknown) => void;
}>();

const overlay = useTemplateRef('overlay');

const listRef = computed(() => overlay.value?.listRef);

const scrollIntoActive = () => {
  overlay.value?.scrollIntoActive();
};

defineExpose({
  scrollIntoActive,
  listRef,
});
</script>

<template>
  <DropdownOverlay ref="overlay" :root="rootRef" class="pl-dropdown__options" tabindex="-1" :gap="3">
    <GroupByList :list="list" group-by="group">
      <template #default="{ groups, rest, hasGroups }">
        <div v-for="[group, items] in groups.entries()" :key="group" :class="{ 'group-container': hasGroups }">
          <TextLabel>{{ group }}</TextLabel>
          <div>
            <DropdownListItem
              v-for="(item, index) in items"
              :key="index"
              :option="item"
              :is-selected="item.isSelected"
              :is-hovered="item.isActive"
              :size="optionSize"
              @click.stop="selectOption(item.value)"
            />
          </div>
        </div>
        <div v-if="rest.length" :class="{ 'group-container': hasGroups }">
          <TextLabel />
          <div>
            <DropdownListItem
              v-for="(item, index) in rest"
              :key="index" :option="item"
              :is-selected="item.isSelected"
              :is-hovered="item.isActive"
              :size="optionSize"
              @click.stop="selectOption(item.value)"
            />
          </div>
        </div>
      </template>
    </GroupByList>
    <div v-if="!list.length" class="nothing-found">Nothing found</div>
  </DropdownOverlay>
</template>
