import { onMounted, onUnmounted } from 'vue';

export function useMouseUp(update: (ev: globalThis.MouseEvent) => void) {
  onMounted(() => window.addEventListener('mouseup', update));
  onUnmounted(() => window.removeEventListener('mouseup', update));
}
