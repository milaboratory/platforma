<script setup lang="ts">
const props = defineProps<{ data: Record<string, { type: string; description: string }> }>();
</script>
<template>
  <div class="props-description-container">
    <div v-for="(value, key) in props.data" :key="key" class="props-description-container__item">
      <div class="props-description-container__wrapper">
        <div class="text-mono-m props-description-container__title">{{ key }}</div>
        <div class="props-description-container__type text-mono-s">{{ value['type'] }}</div>
      </div>

      <div class="text-mono-m props-description-container__description">{{ value['description'] }}</div>
    </div>
  </div>
</template>
<style lang="scss">
.props-description-container {
  &__item {
    margin-bottom: 24px;
  }

  &__wrapper {
    display: flex;
    align-items: center;
  }

  &__type {
    background-color: #bbbccb;
    padding: 4px 8px;
    border-radius: 4px;
  }

  &__title {
    font-family: 'Spline Sans Mono';
    font-size: 16px;
    background-color: var(--color-ic-link);
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    margin-right: 4px;
    color: #dfe0e5;
  }

  &__description {
    margin-top: 6px;
    background-color: #9d9eae;
    padding: 4px 8px;
    border-radius: 4px;
  }
}

.split__column[data-theme] {
  .props-description-container__title,
  .props-description-container__description,
  .props-description-container__type {
    color: #110529;
  }
}
</style>
