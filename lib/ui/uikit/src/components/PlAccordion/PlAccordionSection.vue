<script setup lang="ts">
import { uniqueId } from '@milaboratories/helpers';
import { PlMaskIcon16 } from '../PlMaskIcon16';
import { PlSectionSeparator } from '../PlSectionSeparator';
import ExpandTransition from './ExpandTransition.vue';
import type { Ref } from 'vue';
import { computed, inject } from 'vue';

const $m = inject<Ref<string>>('pl-accordion-model');

const $p = inject<
  Ref<{
    multiple?: boolean;
  }>
>('pl-accordion-props');

const model = defineModel<boolean>();

const id = uniqueId();

const isMulti = computed(() => !$p || $p.value.multiple);

const open = computed({
  get() {
    if (isMulti.value) {
      return model.value;
    }

    return $m ? $m.value === id : model.value;
  },
  set(on) {
    if (isMulti.value) {
      model.value = on;
    } else if ($m) {
      $m.value = $m.value === id ? '' : id;
    }
  },
});

defineProps<{
  /**
   * The label text (optional)
   */
  label?: string;
  /**
   * If `true`, remove top padding
   */
  compact?: boolean;
}>();
</script>

<template>
  <div class="pl-accordion-section">
    <PlSectionSeparator :class="$style.separator" :compact="compact" @click="open = !open">
      <PlMaskIcon16 name="chevron-right" :class="[{ [$style.down]: open }, $style.chevron]" />
      {{ label }}
    </PlSectionSeparator>
    <ExpandTransition>
      <div v-if="open" :class="$style.content">
        <slot />
      </div>
    </ExpandTransition>
  </div>
</template>

<style module>
.content {
  display: flex;
  flex-direction: column;
  gap: var(--gap-v);
  will-change: height, opacity;
  /* transform: translateZ(0);
  backface-visibility: hidden; */
}

.content > *:first-child {
  margin-top: 24px;
}

.content > *:last-child {
  margin-bottom: 4px;
}

.separator:hover {
  --pl-separator-txt-color: var(--txt-01);
  --mask-icon-bg-color: var(--ic-01);
}

.chevron {
  transition-duration: 50ms;
}

.down {
  transform: rotate(90deg);
}
</style>
