<script lang="ts" setup>
import DropdownListItem from "../DropdownListItem.vue";
import { DropdownOverlay } from "../../utils/DropdownOverlay";
import TextLabel from "../../utils/TextLabel.vue";
import { computed, useTemplateRef } from "vue";
import type { LOption } from "./types";

const props = defineProps<{
  rootRef: HTMLElement;
  groups: Map<string, LOption[]>;
  rest: LOption[];
  optionSize: "small" | "medium";
  selectOption: (v: unknown) => void;
}>();

const overlay = useTemplateRef("overlay");

const listRef = computed(() => overlay.value?.listRef);

const hasGroups = computed(() => props.groups.size > 0);

const optionsLength = computed(() => {
  let totalGroupItems = 0;
  for (const items of props.groups.values()) {
    totalGroupItems += items.length;
  }
  return totalGroupItems + props.rest.length;
});

const scrollIntoActive = () => {
  overlay.value?.scrollIntoActive();
};

defineExpose({
  scrollIntoActive,
  listRef,
});
</script>

<template>
  <DropdownOverlay
    ref="overlay"
    :root="rootRef"
    class="pl-dropdown__options"
    data-testid="pl-dropdown-options"
    tabindex="-1"
    :gap="3"
  >
    <div
      v-for="[group, items] in groups.entries()"
      :key="group"
      :class="{ 'group-container': hasGroups }"
      data-testid="pl-dropdown-option-group"
    >
      <TextLabel data-testid="pl-dropdown-option-group-label">{{ group }}</TextLabel>
      <div>
        <DropdownListItem
          v-for="(item, index) in items"
          :key="index"
          :option="item"
          :is-selected="item.isSelected"
          :is-hovered="item.isActive"
          :size="optionSize"
          data-testid="pl-dropdown-option"
          @click.stop="selectOption(item.value)"
        />
      </div>
    </div>
    <div
      v-if="rest.length"
      :class="{ 'group-container': hasGroups }"
      data-testid="pl-dropdown-option-group"
    >
      <TextLabel />
      <div>
        <DropdownListItem
          v-for="(item, index) in rest"
          :key="index"
          :option="item"
          :is-selected="item.isSelected"
          :is-hovered="item.isActive"
          :size="optionSize"
          data-testid="pl-dropdown-option"
          @click.stop="selectOption(item.value)"
        />
      </div>
    </div>
    <div v-if="!optionsLength" class="nothing-found" data-testid="pl-dropdown-options-empty">
      Nothing found
    </div>
  </DropdownOverlay>
</template>
