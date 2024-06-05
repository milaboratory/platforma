import type { Ref } from 'vue';
import { watchEffect } from 'vue';
import type { Data } from './types';
import { useColumn } from './useColumn';
import { getColumnPositions } from './getColumnPositions';
import { MIN_COLUMN_WIDTH, RESIZE_GAP } from './constants';
import { useMouse } from '@/lib/composition/useMouse';
import { useHover } from '@/lib/composition/useHover';
import { utils } from '@milaboratory/helpers';

const { tapIf, clamp } = utils;
export function useResize(data: Data, tableRef: Ref<HTMLElement | undefined>) {
  const mousePos = useMouse();
  const isHovered = useHover(tableRef, {});

  const resize = useColumn(
    (s) => {
      tapIf(data.resizeTh, (th) => {
        data.columnsMeta[th.index] = {
          width: clamp(s.width + s.diff, MIN_COLUMN_WIDTH, 10000),
        };
      });
    },
    () => {
      data.resize = false;
      data.resizeTh = undefined;
      document.body.style.cursor = '';
    },
  );

  function mouseDown(e: { x: number }) {
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
