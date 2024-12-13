<script lang="ts" setup>
import { reactive } from 'vue';
import './pl-status-tag.scss';

type TagTypes = 'success' | 'warning' | 'alert' | 'hold';

withDefaults(defineProps<{ type?: TagTypes }>(), { type: 'success' });

const data = reactive<{ typeToText: Record<TagTypes, string> }>({
  typeToText: {
    success: 'OK',
    warning: 'WARN',
    alert: 'ALERT',
    hold: 'HOLD',
  },
});
</script>
<template>
  <div v-bind="$attrs" :class="{[type]: true}" class="pl-status-tag text-caps11">
    <slot>
      {{ data.typeToText[type] }}
    </slot>
  </div>
</template>
