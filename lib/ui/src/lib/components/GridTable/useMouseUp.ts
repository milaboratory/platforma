import {onMounted, onUnmounted} from 'vue';

// @TODO

export function useMouseUp(update: (ev: globalThis.MouseEvent) => void) {
  onMounted(() => window.addEventListener('mouseup', update));
  onUnmounted(() => window.removeEventListener('mouseup', update));
}
