import type { Ref } from 'vue';
import { watchEffect, unref } from 'vue';
import type { ResizeTh } from '../types';
import { type TableData } from '../types';
import { useColumn } from './useColumn';
import { MIN_COLUMN_WIDTH, RESIZE_GAP } from '../constants';
import { useMouse } from '@/lib/composition/useMouse';
import { useHover } from '@/lib/composition/useHover';
import { tapIf, clamp } from '@milaboratory/helpers/utils';
import { identity } from '../domain';

type MaybeRef<T> = T | Ref<T>;

export function getColumnPositions(tableRef: MaybeRef<HTMLElement | undefined>) {
  const ths = tapIf(unref(tableRef)?.querySelectorAll('.th-cell'), (l) => [...l]) ?? [];
  return ths
    .map((th) => {
      const { width, x } = th.getBoundingClientRect();
      const colId = th.getAttribute('data-col-id')!;
      return identity<ResizeTh>({
        colId,
        width,
        x,
        right: x + width,
      });
    })
    .slice(0, ths.length - 1);
}

export function useResize(data: TableData, tableRef: Ref<HTMLElement | undefined>) {
  const mousePos = useMouse();
  const isHovered = useHover(tableRef, {});

  const resize = useColumn(
    (s) => {
      tapIf(data.resizeTh, (th) => {
        const prevWidth = data.columns.reduce((acc, col) => acc + col.width + 1, 0);
        const col = data.columns.find((col) => col.id === th.colId);
        if (col) {
          col.width = clamp(s.width + s.diff, MIN_COLUMN_WIDTH, 10000);
          const newWidth = data.columns.reduce((acc, col) => acc + col.width + 1, 0);
          const last = data.columns[data.columns.length - 1];
          last.width = last.width + (prevWidth - newWidth);
        }
      });
    },
    () => {
      data.resize = false;
      data.resizeTh = undefined;
      document.body.style.cursor = '';
    },
  );

  function mouseDown(e: MouseEvent) {
    e.preventDefault();
    if (data.resizeTh) {
      data.resize = true;
      resize.start({
        x: e.x,
        width: data.resizeTh.width,
      });
    }
  }

  watchEffect(() => {
    if (!isHovered.value) {
      document.body.style.cursor = '';
      return;
    }

    if (data.resize) {
      return;
    }

    const th = getColumnPositions(tableRef).find((it) => {
      return Math.abs(mousePos.x - it.right) < RESIZE_GAP;
    });

    if (th) {
      document.body.style.cursor = 'col-resize';
      data.resizeTh = th;
    } else {
      data.resizeTh = undefined;
      document.body.style.cursor = '';
    }
  });

  return {
    mouseDown,
  };
}
