<script lang="ts" setup>
import DialogModal from '@/lib/components/DialogModal.vue';
import type { ManageModalSettings, ColumnInfo } from './types';
import BasePane from './BasePane.vue';

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:columns', value: ColumnInfo[]): void;
}>();

defineProps<{
  modelValue: boolean;
  settings: ManageModalSettings;
}>();
</script>

<template>
  <dialog-modal :model-value="modelValue" class="split" width="720px" height="640px" @update:model-value="$emit('update:modelValue', !!$event)">
    <base-pane :settings="settings" @update:columns="$emit('update:columns', $event)" @close="$emit('update:modelValue', false)" />
  </dialog-modal>
</template>

<style lang="scss">
@import '@/lib/assets/mixins.scss';

.form-modal {
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: auto;
  padding: 0 4px;
  flex: 1;
  &__title {
    font-weight: 500;
    font-size: 28px;
    line-height: 32px;
    letter-spacing: -0.56px;
    color: var(--color-txt-01);
    margin-bottom: 16px;
  }
  &__description {
    color: #000;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
  }
  &__actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: auto;
    button {
      min-width: 160px;
    }
    &.bordered {
      border-top: 1px solid var(--color-div-grey);
      padding-top: 24px;
    }
  }
}

.manage-columns {
  .filter-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .left-right {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 0 -24px;
    border-top: 1px solid var(--color-div-grey);
    border-bottom: 1px solid var(--color-div-grey);
    flex: 1;

    > div {
      border-right: 1px solid var(--color-div-grey);
      max-height: 460px;
      // @include scrollbar(true);

      &:last-child {
        border-right: none;
      }

      .split__header {
        color: var(--color-txt-03);
        font-size: 13px;
        font-style: normal;
        font-weight: 600;
        line-height: 14px;
        letter-spacing: 0.52px;
        text-transform: uppercase;
        padding: 12px 24px 6px 24px;
        margin-bottom: 24px;
      }
    }
  }

  .filter {
    &__list {
      display: flex;
      flex-direction: column;
    }

    &__it {
      display: flex;
      flex-direction: column;
      padding: 8px 12px 8px 24px;
      gap: 8px;
      align-self: stretch;
      &.active {
        background-color: rgba(99, 224, 36, 0.24);
      }
    }

    &__chip {
      display: flex;
      flex-direction: row;
      align-items: center;
      border-radius: 6px;
      border: 1px solid var(--color-div-grey, #e1e3eb);
      height: 40px;
      padding: 0px 12px;
      margin: 0 24px 8px;
      &.active {
        border-radius: 6px;
        border: 2px solid var(--color-focus, #49cc49);
        background: var(--bg-elevated-01, #fff);
        // box-shadow: 0px 0px 0px 4px rgba(73, 204, 73, 0.24);
      }
      &__title {
        color: var(--color-txt-01);
        font-size: 14px;
        font-style: normal;
        font-weight: 600;
        line-height: 20px; /* 142.857% */
      }
    }

    &__button {
      display: flex;
      flex-direction: row;
      align-items: center;
      border-radius: 6px;
      border: 1px dashed var(--color-div-grey, #e1e3eb);
      height: 40px;
      padding: 0px 12px;
      margin: 0 24px 8px;
    }

    &__title {
      color: var(--color-txt-01);
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
    }

    &__description {
      color: var(--color-txt-03);
      font-size: 12px;
      font-weight: 500;
      line-height: 16px;
    }
  }
}
</style>
