import { onMounted, onUnmounted, reactive } from 'vue';

export function useMouse() {
  const pos = reactive({
    x: 0,
    y: 0,
  });

  function update(event: MouseEvent) {
    pos.x = event.pageX;
    pos.y = event.pageY;
  }

  onMounted(() => window.addEventListener('mousemove', update));
  onUnmounted(() => window.removeEventListener('mousemove', update));

  return pos;
}
