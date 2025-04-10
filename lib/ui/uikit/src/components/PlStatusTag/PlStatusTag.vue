<script lang="ts" setup>
import './pl-status-tag.scss';
import type { PlStatusTagType } from './types';

defineProps<{ type?: PlStatusTagType }>();

const typeToText = {
  OK: 'OK',
  WARN: 'WARN',
  ALERT: 'ALERT',
  HOLD: 'HOLD',
} satisfies Record<PlStatusTagType, string>;
</script>

<template>
  <div v-if="type" v-bind="$attrs" :class="{[type.toLocaleLowerCase()]: true}" class="pl-status-tag text-caps11 d-flex align-center">
    <slot>
      {{ typeToText[type] }}
    </slot>
  </div>
</template>
