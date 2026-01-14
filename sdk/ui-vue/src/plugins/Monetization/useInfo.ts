import { computed, watch, ref } from 'vue';
import { useSdkPlugin } from '../../defineApp';
import { Response } from './validation';
import { useIntervalFn } from '@vueuse/core';

export function useInfo() {
  const sdk = useSdkPlugin();

  const app = computed(() => (sdk.loaded ? sdk.useApp() : undefined));

  // TODO v3 (temp hack)
  const getModelArgsOrState = (model: Record<string, unknown> | undefined) => {
    if (!model) return {};
    if ('state' in model) {
      return model.state as Record<string, unknown>;
    } else if ('args' in model) {
      return model.args as Record<string, unknown>;
    }
    return {};
  };

  const model = computed(() => getModelArgsOrState(app.value?.model));

  const hasMonetization = computed(() => {
    return model.value && ('__mnzDate' in model.value);
  });

  const parsed = computed(() => Response.safeParse(app.value?.model.outputs['__mnzInfo']));

  const currentInfo = computed<Response | undefined>(() => parsed.value?.data);

  const error = computed(() => parsed.value?.error ?? info.value?.response?.error);

  const info = ref<Response | undefined>(undefined);

  const isLoading = ref(false);

  const version = ref(0);

  watch([currentInfo], ([i]) => {
    if (i) {
      info.value = i;
      const v = ++version.value;
      setTimeout(() => {
        if (version.value === v) {
          isLoading.value = false;
        }
      }, 1000);
    }
  }, { immediate: true });

  const result = computed(() => info.value?.response?.result);

  const canRun = computed(() => !!result.value?.canRun);

  const status = computed(() => currentInfo.value ? result.value?.status : '');

  const customerEmail = computed(() => result.value?.customerEmail);

  const endOfBillingPeriod = computed(() => result.value?.mnz.endOfBillingPeriod);

  const limits = computed(() => result.value?.mnz.limits);

  const refresh = () => {
    isLoading.value = true;
    (model.value)['__mnzDate'] = new Date().toISOString();
  };

  watch(canRun, (v) => {
    if (hasMonetization.value) {
      (model.value as Record<string, unknown>)['__mnzCanRun'] = v;
    }
  });

  if (hasMonetization.value) {
    useIntervalFn(refresh, 60_000); // 1 minute
  }

  return {
    hasMonetization,
    result,
    error,
    canRun,
    status,
    customerEmail,
    endOfBillingPeriod,
    limits,
    refresh,
    version,
    isLoading,
  };
}
