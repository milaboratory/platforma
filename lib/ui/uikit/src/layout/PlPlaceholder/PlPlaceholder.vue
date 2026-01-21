<script lang="ts">
import paintWorkletCode from './paint-worklet.js?raw';

export interface PlPlaceholderProps {
  variant?: 'table' | 'graph';
  title?: string;
  subtitle?: string | string[];
}

// Register paint worklet once at module load (uses blob URL to comply with CSP)
const workletBlob = new Blob(
  [paintWorkletCode],
  { type: 'application/javascript' },
);
const workletUrl = URL.createObjectURL(workletBlob);
(CSS as unknown as {
  paintWorklet: { addModule: (url: string) => void };
}).paintWorklet.addModule(workletUrl);
</script>

<script setup lang="ts">
import { useCssModule } from 'vue';
import PlLoaderLogo from '../../components/PlLoaderLogo.vue';

const props = defineProps<PlPlaceholderProps>();

const styles = useCssModule();
</script>

<template>
  <div :class="styles.root">
    <div
      :class="[styles.background, {
        [styles.table]: props.variant === 'table',
        [styles.graph]: props.variant === 'graph',
      }]"
    />
    <div :class="styles.content">
      <PlLoaderLogo :size="64" color="var(--color-div-grey)" />
      <div v-if="props.title || props.subtitle" :class="styles.text">
        <div v-if="props.title" :class="styles.title">{{ props.title }}</div>
        <div v-if="props.subtitle" :class="styles.subtitle">
          <template v-if="Array.isArray(props.subtitle)">
            <span v-for="(item, key) of props.subtitle" :key>{{ item }}</span>
          </template>
          <span v-else>{{ props.subtitle }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.root {
  block-size: 100%;
  inline-size: 100%;
  position: relative;
  user-select: none;
  background-color: var(--bg-elevated-01);
}

.background {
  position: absolute;
  inset: 0;
  pointer-events: none;
  mask: linear-gradient(transparent 35%, #000 40% 60%, transparent 65%);
  mask-size: 100% 300%;
  animation-duration: 5s;
  animation-iteration-count: infinite;
  animation-name: slide;
  &.table {
    background-image: paint(pl-placeholder-table-skeleton);
  }
  &.graph {
    background-image: paint(pl-placeholder-graph-skeleton);
  }
}

.content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
}

.text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  -webkit-text-stroke-color: white;
  -webkit-text-stroke-width: 4px;
  paint-order: stroke;
}

.title {
  color: var(--txt-03);
  font-size: 20px;
  font-weight: 500;
  line-height: 24px;
  letter-spacing: -0.2px;
}

.subtitle {
  color: var(--txt-03);
  font-weight: 500;
  line-height: 20px;
  display: grid;
  span {
    grid-area: 1 / 1;
    text-align: center;
    animation-name: active-subtitle;
    animation-duration: calc(6s * sibling-count());
    animation-iteration-count: infinite;
    animation-timing-function: steps(sibling-count(), jump-none);
    visibility: if(
      style(--pl-placeholder-active-subtitle: sibling-index()): visible;
      else: hidden;
    );
  }
}

@keyframes slide {
  from {
    mask-position: 0 100%;
  }
}

@keyframes active-subtitle {
  from {
    --pl-placeholder-active-subtitle: 1;
  }
  to {
    --pl-placeholder-active-subtitle: sibling-count();
  }
}

@property --pl-placeholder-active-subtitle {
  syntax: '<number>';
  inherits: false;
  initial-value: 1;
}
</style>
