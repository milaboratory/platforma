<script lang="ts" setup>
import { computed, inject, unref } from 'vue';
import { todoListKey } from './keys';
import { notEmpty } from '@/lib/helpers/utils';

const props = defineProps<{
  id: number;
}>();

const state = notEmpty(inject(todoListKey), 'Empty state');

const item = computed(() => unref(state).items.find((it) => it.id === props.id));

const text = computed(() => unref(item)?.text);

const completed = computed(() => unref(item)?.completed);
</script>

<template>
  <div class="todo-item" @click.stop="() => state.markAsCompleted(id)">
    {{ id }}) {{ text }} <button class="todo-item__status" :class="{ completed }"></button>
  </div>
</template>

<style lang="scss" scoped>
.todo-item {
  display: flex;
  align-items: center;
  &__status {
    --content: '⌛';
    margin-left: auto;
    cursor: pointer;
    &::before {
      content: var(--content);
      font-size: 16px;
    }
    &.completed {
      color: #07ad3e;
      --content: '👌';
    }
  }
}
</style>
