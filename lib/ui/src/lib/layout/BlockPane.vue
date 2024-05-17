<script lang="ts" setup>
import { computed } from 'vue';

const errors = computed(() => []); // @TODO global errors

const errorMessages = computed(() =>
  errors.value.map((e) => {
    try {
      const structured = JSON.parse(e);

      if ('message' in structured) {
        return structured.message;
      }
    } catch {
      // do nothing
    }

    return String(e);
  }),
);
</script>

<template>
  <div class="block block__pane">
    <div v-if="errors.length" class="block__error">
      <pre v-for="(msg, i) in errorMessages" :key="i">{{ msg }}</pre>
    </div>
    <slot />
    <slot name="actions" />
  </div>
</template>

<style lang="scss">
@import '../assets/mixins.scss';

.block {
  flex: 1;
  background-color: #fff;
  @include scrollbar(true, true);
  max-height: 100%;
  max-width: 100%;
  width: 100%;
  height: 100%;
  position: relative;

  display: flex;
  flex-direction: column;

  &__pane {
    position: relative;
  }

  &__error {
    background: var(--color-error);
    color: #fff;
    max-height: 50vh;
    padding: 16px 24px;
    user-select: auto;
    @include scrollbar(true, true); // @todo scrollbar persistent
    width: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    pre {
      white-space: pre-wrap;
      margin: 0;
    }
  }

  &__title {
    font-weight: 500;
    font-size: 28px;
    display: flex;
    align-items: center;
    gap: 12px;
    letter-spacing: -0.02em;
    height: 42px;
    line-height: 42px; // @TODO

    &__label {
      display: flex;
      align-items: end;
    }

    &__description {
      color: var(--color-txt-03);
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      margin-top: 8px;
    }
  }

  &__subtitle {
    font-weight: 500;
    font-size: 20px;
    line-height: 24px;
    letter-spacing: -0.01em;
    display: flex;
    align-items: flex-end;
    margin-bottom: 40px;
  }

  .editable-label {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    .icon {
      opacity: 0;
      transition: opacity;
      transition-duration: 0.3s;
      width: 24px;
      height: 24px;
      background: url('./icons/24_edit.svg') no-repeat;
    }
    &:hover {
      .icon {
        opacity: 1;
      }
    }
  }

  &__section {
    padding: 19px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 100%;

    &.flex-1 {
      flex-grow: 1;
      flex-shrink: 0;
      display: flex;
      height: calc(100% - 96px);
      max-height: calc(100% - 96px);
    }
  }

  &__row {
    display: flex;
    flex-direction: row;
    gap: 6px;

    &.align-center {
      align-items: center;
    }

    .ui-select-input__envelope {
      // width: 100%;
      flex: 1;
    }

    &.grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }

  .scroll-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    > div:last-child {
      flex: 1;
      overflow: auto;
    }
  }
}
</style>
