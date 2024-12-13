<script lang="ts" setup>
import { reactive } from 'vue';
import './pl-status-tag.scss';
import type { PlStatusTagType } from './types';

defineProps<{ type?: PlStatusTagType }>();

const data = reactive<{ typeToText: Record<PlStatusTagType, string> }>({
  typeToText: {
    OK: 'OK',
    WARN: 'WARN',
    ALERT: 'ALERT',
    HOLD: 'HOLD',
  },
});
</script>
<template>
  <div v-if="type" v-bind="$attrs" :class="{[type.toLocaleLowerCase()]: true}" class="pl-status-tag text-caps11 d-flex align-center">
    <slot>
      {{ data.typeToText[type] }}
    </slot>
  </div>
</template>
