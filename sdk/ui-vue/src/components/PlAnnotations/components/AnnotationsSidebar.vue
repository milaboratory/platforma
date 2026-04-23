<script setup lang="ts">
import $commonStyle from "./style.module.css";

import { produce } from "immer";
import { randomInt } from "@milaboratories/helpers";
import {
  PlBtnGhost,
  PlBtnSecondary,
  PlEditableTitle,
  PlElementList,
  PlSidebarItem,
  PlTextField,
} from "@milaboratories/uikit";
import type { Annotation } from "../types";
import { validateTitle } from "../utils";
import { isEmpty } from "es-toolkit/compat";

const props = defineProps<{
  annotation: Annotation;
  selectedStepId: undefined | number;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onUpdateSelectedStepId: (id: undefined | number) => void;
}>();

const emits = defineEmits<{
  (e: "delete-schema"): void;
}>();

function produceAnnotationUpdate(updater: (draft: Annotation) => void) {
  props.onUpdateAnnotation(produce(props.annotation, updater));
}

function updateTitle(title: string) {
  produceAnnotationUpdate((draft) => {
    draft.title = title;
  });
}

function updateSteps(steps: Annotation["steps"]) {
  produceAnnotationUpdate((draft) => {
    draft.steps = steps;
  });
}

function updateDefaultValue(value: string) {
  produceAnnotationUpdate((draft) => {
    draft.defaultValue = value === "" ? undefined : value;
  });
}

function handleAddStep() {
  const id = randomInt();
  produceAnnotationUpdate((draft) => {
    draft.steps.push({
      id,
      label: "",
      filter: {
        id: randomInt(),
        type: "and",
        filters: [],
      },
    });
  });
  props.onUpdateSelectedStepId(id);
}
</script>

<template>
  <PlSidebarItem>
    <template #header-content>
      <PlEditableTitle
        :model-value="props.annotation.title"
        :class="{ [$commonStyle.flashing]: props.annotation.title.length === 0 }"
        :max-length="40"
        max-width="600px"
        placeholder="Annotation Title"
        :autofocus="props.annotation.title.length === 0"
        :validate="validateTitle"
        @update:model-value="updateTitle"
      />
    </template>
    <template v-if="props.annotation" #body-content>
      <div :class="[$style.root, { [$commonStyle.disabled]: props.annotation.title.length === 0 }]">
        <span :class="$style.tip">
          Above annotations override the ones below. Rearrange them by dragging.
        </span>
        <PlElementList
          :items="props.annotation.steps"
          :get-item-key="(item) => item.id"
          :is-active="(item) => item.id === props.selectedStepId"
          :item-class="$style.stepItem"
          :class="$style.steps"
          @update:items="updateSteps"
          @item-click="(item) => props.onUpdateSelectedStepId(item.id)"
        >
          <template #item-title="{ item }">
            {{ item.label }}
          </template>
        </PlElementList>

        <PlBtnSecondary icon="add" @click="handleAddStep"> Add label </PlBtnSecondary>

        <PlTextField
          :class="[
            $style.defaultValue,
            { [$style.emptyDefaultValue]: isEmpty(props.annotation.defaultValue) },
          ]"
          :model-value="props.annotation.defaultValue ?? ''"
          label="Label remaining with"
          placeholder="No label"
          clearable
          helper="This label will be applied to the remaining rows, after all other filters are applied."
          @click.stop
          @update:model-value="updateDefaultValue"
        />
      </div>
    </template>
    <template #footer-content>
      <PlBtnGhost
        icon="delete-bin"
        reverse
        :disabled="props.annotation.steps.length === 0"
        @click.stop="emits('delete-schema')"
      >
        Delete Schema
      </PlBtnGhost>
    </template>
  </PlSidebarItem>
</template>

<style lang="scss" module>
@use "@milaboratories/uikit/styles/variables" as *;

.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip {
  color: var(--txt-03);
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stepItem {
  cursor: pointer;
}

.defaultValue {
  margin-top: 8px;
}
.emptyDefaultValue {
  opacity: 0.5;
  transition: opacity 0.2s ease-in-out;

  &:hover {
    opacity: 1;
  }
}
</style>
