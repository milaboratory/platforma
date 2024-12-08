<template>
  <div class="component-props border-default">
    <div class="component-props__header d-flex align-center text-subtitle-s border-bottom-default">
      Props
    </div>
    <div class="component-props__props d-flex flex-column gap-4">
      <template v-for="(item, name) in data" :key="name">
        <span class="component-props__props-name text-mono-m"> {{ name }}: </span>
        <span class="component-props__props-value">
          {{ item['type'] }}
        </span>
        <span class="component-props__props-description">
          {{ item['description'] }}
        </span>
        <div class="line"/>
      </template>
    </div>

    <div v-if="events">
      <div
        class="component-props__header d-flex align-center text-subtitle-s border-bottom-default"
      >
        Events
      </div>
      <div class="component-props__events d-flex flex-column gap-4">
        <template v-for="(item, name) in events" :key="name">
          <span class="component-props__event-name text-mono-m"> @{{ name }}: </span>
          <span class="component-props__event-description text-mono-m">
            {{ item }}
          </span>
          <div class="line"/>
        </template>
      </div>
    </div>
    <div v-if="slots">
      <div
        class="component-props__header d-flex align-center text-subtitle-s border-bottom-default"
      >
        Slots
      </div>
      <div class="component-props__events d-flex flex-column gap-4">
        <template v-for="(item, name) in slots" :key="name">
          <span class="component-props__event-name text-mono-m"> @{{ name }}: </span>
          <span class="component-props__event-description text-mono-m">
            {{ item }}
          </span>
          <div class="line"/>
        </template>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  data: Record<string, { type: string; description: string }>;
  events?: Record<string, string>;
  slots?: Record<string, string>;
}>();
</script>

<style lang="scss">
.line {
  grid-column: 1 / -1;
  height: 2px;
  border-bottom: 1px solid var(--border-color-default);
  width: 100%;
}

.line:last-child {
  border: none;
}
.component-props {
  border-radius: 6px;
  &__header {
    height: 48px;
    padding-left: 6px;
  }

  &__events {
    padding: 12px;
    display: grid;
    grid-template-columns: 0.3fr auto;
  }

  &__props {
    padding: 12px;

    display: grid;
    grid-template-columns: auto fit-content(48ch) auto;
  }

  &__props-name,
  &__event-name {
    color: var(--txt-00);
    font-weight: 600;
    background-color: var(--bg-base-dark);
    border-radius: 4px;
    padding: 2px 6px;
    text-align: center;
    height: fit-content;
  }

  &__event-description {
    color: var(--txt-01);
    padding: 2px 6px;
  }

  &__props-value {
    color: var(--btn-accent-default);
    padding: 2px 6px;
    font-family: var(--font-family-monospace);
    white-space: pre;
  }

  &__props-description {
    color: var(--txt-01);
    font-family: var(--font-family-monospace);
  }
}
</style>
