import type { Ref } from 'vue';
import { computed, watchEffect } from 'vue';
import { useEventListener } from './useEventListener';

type SortableItem = {
  el: HTMLElement;
  y: number;
  dy: number;
  orderChanged: boolean;
};

export type SortableSettings = {
  onChange: (indices: number[]) => void;
  handle?: string;
  shakeBuffer?: number;
  reorderDelay?: number;
  transitionDelay?: string;
};

const classes = {
  item: 'sortable__item',
  animate: 'sortable__animate',
};

const getOffset = (el: HTMLElement) => {
  return el.getBoundingClientRect().y;
};

const getMiddle = (el: HTMLElement) => {
  const { y, height } = el.getBoundingClientRect();
  return y + Math.ceil(height / 2);
};

const getBottom = (el: HTMLElement) => {
  const { y, height } = el.getBoundingClientRect();
  return y + height;
};

export function useSortable(listRef: Ref<HTMLElement | undefined>, settings: SortableSettings) {
  const state = {
    item: undefined as SortableItem | undefined,
    options() {
      return [...(listRef.value?.children ?? [])] as HTMLElement[];
    },
  };

  const optionsRef = computed(() => {
    return state.options();
  });

  const shakeBuffer = settings.shakeBuffer ?? 10;

  const reorderDelay = settings.reorderDelay ?? 100;

  function mouseDown(this: HTMLElement, e: { y: number; target: EventTarget | null }) {
    const handle = settings.handle ? this.querySelector(settings.handle) : null;

    if (handle && !handle.contains(e.target as HTMLElement)) {
      return;
    }

    this.classList.remove(classes.animate);
    this.classList.add(classes.item);

    state.item = {
      el: this,
      y: e.y,
      dy: 0,
      orderChanged: false,
    };
  }

  function elementsBefore(el: HTMLElement) {
    const options = state.options();
    return options.slice(0, options.indexOf(el));
  }

  function elementsAfter(el: HTMLElement) {
    const children = state.options();
    return children.slice(children.indexOf(el) + 1);
  }

  function insertBefore(before: HTMLElement, el: HTMLElement) {
    const children = state.options().filter((e) => e !== el);
    const index = children.indexOf(before);
    children.splice(index, 0, el);
    return children;
  }

  function insertAfter(after: HTMLElement, el: HTMLElement) {
    const children = state.options().filter((e) => e !== el);
    const index = children.indexOf(after);
    children.splice(index + 1, 0, el);
    return children;
  }

  function updatePosition(item: SortableItem, y: number) {
    item.dy = y - item.y;
    item.el.style.setProperty('transform', `translateY(${item.dy}px)`);
  }

  function changeOrder(reordered: HTMLElement[]) {
    if (!state.item) {
      return;
    }

    const { el } = state.item;

    if (!el.isConnected) {
      state.item = undefined;
      return;
    }

    const oldPositions = reordered.map((e) => getOffset(e));

    const y1 = getOffset(el);
    listRef.value?.replaceChildren(...reordered);
    const y2 = getOffset(el);

    const newPositions = reordered.map((e) => getOffset(e));

    const toAnimate: HTMLElement[] = [];

    for (let i = 0; i < newPositions.length; i++) {
      const option = reordered[i];

      if (option === state.item.el) {
        continue;
      }

      const newY = newPositions[i];

      const oldY = oldPositions[i];

      const invert = oldY - newY;

      option.style.transform = `translateY(${invert}px)`;

      toAnimate.push(option);
    }

    const dy = y2 - y1;

    state.item.y = state.item.y + dy;
    state.item.dy = state.item.dy - dy;
    state.item.orderChanged = true;
    state.item.el.style.setProperty('transform', `translateY(${state.item.dy}px)`);

    toAnimate.forEach((o) => o.classList.remove(classes.animate));

    requestAnimationFrame(function () {
      toAnimate.forEach((option) => {
        option.classList.add(classes.animate);
        option.style.transform = '';
        option.addEventListener('transitionend', () => {
          option.classList.remove(classes.animate);
        });
      });
    });
  }

  useEventListener(window, 'mousemove', (e: { y: number }) => {
    if (!state.item) {
      return;
    }

    const { el } = state.item;

    updatePosition(state.item, e.y);

    const upper = getOffset(state.item.el);
    const bottom = getBottom(state.item.el);

    const before = elementsBefore(el);
    const after = elementsAfter(el);

    before.forEach((e) => {
      const y = getMiddle(e);

      if (upper + shakeBuffer < y) {
        changeOrder(insertBefore(e, el));
      }
    });

    after.forEach((e) => {
      const y = getMiddle(e);

      if (bottom - shakeBuffer > y) {
        changeOrder(insertAfter(e, el));
      }
    });
  });

  useEventListener(window, 'mouseup', () => {
    if (!state.item) {
      return;
    }

    const { el, orderChanged } = state.item;

    el.classList.add(classes.animate);
    el.style.removeProperty('transform');

    el.addEventListener('transitionend', () => {
      el.classList.remove(classes.animate, classes.item);
    });

    setTimeout(() => {
      if (!orderChanged) {
        return;
      }

      const newIndices = state.options().map((o) => Number(o.getAttribute('data-index')));

      const list = listRef.value;

      if (list) {
        for (const child of state.options()) {
          list.removeChild(child);
        }

        optionsRef.value.forEach((child) => {
          list.appendChild(child);
        });
      }

      settings.onChange(newIndices);
    }, reorderDelay);

    state.item = undefined;
  });

  watchEffect(() => {
    optionsRef.value.forEach((child, i) => {
      child.removeEventListener('mousedown', mouseDown);
      child.addEventListener('mousedown', mouseDown);
      child.setAttribute('data-index', String(i));
    });
  });
}