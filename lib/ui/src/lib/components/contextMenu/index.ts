import type { IOption } from '@/lib/types';
import Menu from './Menu.vue';
import { h, render } from 'vue';

//   showOptions<T>(options: readonly (UiOption<T> & {hide?: boolean})[], cb: (value: T) => void): void;

export function showContextMenu<const T>(ev: MouseEvent, options: readonly IOption<T>[], cb: (value: T) => void) {
  ev.preventDefault();

  const destroy = () => {
    render(null, document.body);
  };

  const vNode = h(Menu, {
    options,
    cb: cb as (value: unknown) => void,
    onClose: () => {
      destroy();
    }
  });

  render(vNode, document.body);

  const el = vNode.el as HTMLElement;

  el.style.top = ev.clientY + 'px';
  el.style.left = ev.clientX + 'px';

  document.addEventListener('click', (ev: Event) => {
    if (!el.contains(ev.target as HTMLElement)) {
      destroy();
    }
  });

  return destroy;
}