<script setup lang="ts">
import { computed } from 'vue';
import './pl-progress-cell.scss';
import PlMaskIcon24 from '../PlMaskIcon24/PlMaskIcon24.vue';
import type { PlProgressCellProps } from './types';

const props = withDefaults(defineProps<PlProgressCellProps>(), {
  stage: 'not_started',
  step: '', // main text (left)
  progressString: '', // appended text on the right side (right)
  progress: undefined,
  error: '',
});

const canShowWhiteBg = computed(() => props.stage !== 'not_started');

const currentProgress = computed(() => props.stage === 'done' ? 100 : Math.min(100, props.progress || 0));

const canShowInfinityLoader = computed(() => props.progress === undefined && props.stage !== 'done' && props.stage !== 'not_started' && !props.error);
</script>

<template>
  <div :class="{'progress-cell':true, 'progress-cell__white-bg': canShowWhiteBg, error, 'not-started': props.stage === 'not_started' }">
    <div v-if="canShowInfinityLoader" class="progress-cell__infinity-loader">
      <div class="progress-cell__infinity-gradient"/>
    </div>
    <div v-if="!canShowInfinityLoader && !error" class="progress-cell__indicator" :style="{ width: currentProgress + '%' }"/>
    <div class="progress-cell__body">
      <div class="progress-cell__stage text-s">
        {{ error ? error : step }}
      </div>
      <div class="progress-cell__percentage text-s d-flex align-center justify-end">
        <PlMaskIcon24 v-if="error" name="error" />
        <template v-if="!error">
          {{ progressString }}
        </template>
      </div>
    </div>
  </div>
</template>
