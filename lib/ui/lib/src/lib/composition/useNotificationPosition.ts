import { type Ref, ref } from 'vue';
import { call } from '@/lib/helpers/utils';
import { usePosition } from '@/lib/composition/usePosition';

export function useNotificationPosition(el: Ref<HTMLElement | undefined>) {
  const style = ref('');

  usePosition(el, (pos) => {
    style.value = call(() => {
      return `left: ${pos.offsetX + pos.width - 320}px; bottom: ${pos.scrollHeight - pos.offsetY + 10}px;`;
    });
  });

  return style;
}
