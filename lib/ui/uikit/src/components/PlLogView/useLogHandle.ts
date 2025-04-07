import { reactive, type Reactive, ref, watch } from 'vue';
import { useTimeoutPoll, whenever } from '@vueuse/core';
import { getRawPlatformaInstance, type AnyLogHandle, type Platforma } from '@platforma-sdk/model';

type LogState = {
  logHandle: AnyLogHandle;
  lines: string;
  lastOffset: number;
  finished: boolean;
  error: unknown;
};

const ProgressPrefixDefault = '[==PROGRESS==]'; // @TODO ?

// from here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function useLogHandle(
  props: Reactive<{ logHandle: AnyLogHandle | undefined; maxRetries?: number; mockPlatforma?: Platforma; progressPrefix?: string }>,
) {
  const logState = ref<LogState>();

  const data = reactive({
    errorCount: 0,
  });

  async function fetchLogs() {
    // making a snapshot of the ref
    let currentLogState: LogState | undefined = logState.value;

    if (currentLogState === undefined) return;

    const platforma = props.mockPlatforma ?? getRawPlatformaInstance();

    if (!platforma) {
      console.warn('Platforma API is not available');
      return;
    }

    while (true) {
      const result = await platforma.logDriver.readText(currentLogState.logHandle, 100, currentLogState.lastOffset);

      currentLogState.error = undefined;

      data.errorCount = 0;

      if (result.shouldUpdateHandle) return;

      // somebody changed target log while we were fetching log data
      // @TODO There may be a situation where the new descriptor points to the same file and we don't need to reread it
      if (currentLogState.logHandle !== logState.value?.logHandle) return;

      const progressPrefix = props.progressPrefix ?? ProgressPrefixDefault;

      const newLines = new TextDecoder().decode(result.data).replace(new RegExp(`${escapeRegExp(progressPrefix)}`, 'g'), '');

      // We simply change it in a mutable way: if logHandle has been changed, it points to the new object
      currentLogState = Object.assign(currentLogState, {
        lines: currentLogState.lines + newLines,
        lastOffset: result.newOffset,
        finished: !result.live,
      });

      if (result.newOffset >= result.size) break;
    }
  }

  const fetchAndCatch = () =>
    fetchLogs().catch((err) => {
      if (logState.value) {
        data.errorCount++;
        if (data.errorCount > (props.maxRetries ?? 3)) {
          logState.value.error = err;
        } else {
          console.warn('skip error:', err, 'retry...');
        }
      }
    });

  // Only trigger after last fetch is done
  const timeoutPoll = useTimeoutPoll(fetchAndCatch, 1500, { immediate: false });

  whenever(
    () => logState?.value?.finished,
    () => timeoutPoll.pause(),
  );

  watch(
    () => props.logHandle,
    (lh) => {
      if (lh === undefined) {
        logState.value = undefined;
        timeoutPoll.pause();
      } else if (lh !== logState.value?.logHandle) {
        logState.value = { logHandle: lh, lastOffset: 0, lines: '', finished: false, error: undefined };
        data.errorCount = 0;
        timeoutPoll.resume();
      }
    },
    { immediate: true },
  );

  return logState;
}
