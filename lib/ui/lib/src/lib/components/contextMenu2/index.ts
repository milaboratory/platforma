import Menu from './Menu.vue';
import { h, render } from 'vue';
import type { ContextOption } from './types';

export function showContextMenu(ev: MouseEvent, options: readonly ContextOption[]) {
  ev.preventDefault();

  const destroy = () => {
    render(null, document.body);
  };

  const vNode = h(Menu, {
    options,
    onClose: () => {
      destroy();
    },
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
